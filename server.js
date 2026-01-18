const express = require('express');
const http = require('http');
const WebSocket = require('ws');
// Valid import for y-websocket@1.5.4
const { setupWSConnection } = require('y-websocket/bin/utils');
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
