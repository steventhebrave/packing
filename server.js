const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
// Valid import for y-websocket@1.5.4
const { setupWSConnection, getYDoc, getPersistence } = require('y-websocket/bin/utils');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// --- CONFIGURATION ---
const PORT = process.env.PORT || 1234;
const UPLOAD_DIR = path.join(process.env.YPERSISTENCE || './ydata', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.static('public')); // Serve frontend assets if we want to bundle them later
app.use('/uploads', express.static(UPLOAD_DIR)); // Serve uploaded images

// --- UPLOAD HANDLING ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR)
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext)
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit catch-all
});

app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    // Return the relative URL to the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// --- COUNTER API (for home-screen widgets / shortcuts) ---
// Reads/mutates the SAME shared Y.Doc the websocket clients use, so changes
// broadcast live to open apps and persist to disk. `room` is the URL-hash room
// name (e.g. counter-ab12); `person` is the counter key (aster/lyra/mummy/daddy).
//
// Optional shared-secret gate: set WIDGET_TOKEN in the environment and pass the
// same value as ?token=... If WIDGET_TOKEN is unset, no token is required.
const WIDGET_TOKEN = process.env.WIDGET_TOKEN || null;

function readCount(counters, person) {
    const v = counters.get(person);
    return Number.isFinite(v) ? v : 0;
}

// getYDoc kicks off persistence loading ASYNCHRONOUSLY and returns an empty doc
// immediately. A synchronous read on a "cold" room (no clients connected, so the
// doc isn't already in memory) therefore sees count 0 and would clobber the real
// value on disk — e.g. bumping a room that holds 5 responds {count:1}. This waits
// for the persisted state and applies it to the shared doc before we read. It's
// idempotent (safe on warm docs too) since applyUpdate re-adds only what's missing.
async function getLoadedCounters(room) {
    const doc = getYDoc(room);
    const persistence = typeof getPersistence === 'function' ? getPersistence() : null;
    if (persistence && persistence.provider && typeof persistence.provider.getYDoc === 'function') {
        const persisted = await persistence.provider.getYDoc(room);
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(persisted));
    }
    return { doc, counters: doc.getMap('counters') };
}

// Serialize load+read+write per room so two near-simultaneous requests can't both
// read the same base and lose one increment. Each room keeps the tail of a promise
// chain; new work runs after the previous op settles (success or failure).
const roomLocks = new Map();
function withRoomLock(room, fn) {
    const prev = roomLocks.get(room) || Promise.resolve();
    const next = prev.then(fn, fn);
    roomLocks.set(room, next.catch(() => {}));
    return next;
}

// Validate common params; returns { room, person } or sends an error and returns null.
function parseCounterReq(req, res) {
    if (WIDGET_TOKEN && req.query.token !== WIDGET_TOKEN) {
        res.status(401).json({ error: 'invalid or missing token' });
        return null;
    }
    const room = req.query.room;
    const person = req.query.person;
    if (!room || !person) {
        res.status(400).json({ error: 'room and person query params are required' });
        return null;
    }
    return { room, person };
}

// GET /api/count?room=counter-ab12&person=aster  ->  { count }
app.get('/api/count', async (req, res) => {
    const p = parseCounterReq(req, res);
    if (!p) return;
    try {
        const count = await withRoomLock(p.room, async () => {
            const { counters } = await getLoadedCounters(p.room);
            return readCount(counters, p.person);
        });
        res.json({ count });
    } catch (err) {
        console.error('count failed', err);
        res.status(500).json({ error: 'failed to read counter' });
    }
});

// GET /api/increment?room=counter-ab12&person=aster[&by=1]  ->  { count }
// GET so the simplest tools (a plain URL) can trigger it.
app.get('/api/increment', async (req, res) => {
    const p = parseCounterReq(req, res);
    if (!p) return;
    const by = parseInt(req.query.by, 10);
    const delta = Number.isNaN(by) ? 1 : by;
    try {
        const count = await withRoomLock(p.room, async () => {
            const { doc, counters } = await getLoadedCounters(p.room);
            const next = readCount(counters, p.person) + delta;
            doc.transact(() => counters.set(p.person, next));
            return next;
        });
        res.json({ count });
    } catch (err) {
        console.error('increment failed', err);
        res.status(500).json({ error: 'failed to increment counter' });
    }
});

// --- WEBSOCKET HANDLING ---
// Delegate websocket connection to y-websocket
setupWSConnection.bind = setupWSConnection.bind || function (wss, req) {
    setupWSConnection(wss, req);
};

server.on('upgrade', (request, socket, head) => {
    // You can authenticate here
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws, req) => {
    setupWSConnection(ws, req);
});

// --- START SERVER ---
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Uploads directory: ${UPLOAD_DIR}`);
});
