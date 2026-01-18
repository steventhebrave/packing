FROM node:20-alpine
WORKDIR /app

# Minimal package; install server & dependencies
# Pinning y-websocket to 1.5.4 to ensure compatibility with standard examples
RUN npm init -y && \
    npm install y-websocket@1.5.4 yjs express multer ws cors

# Copy server code
COPY server.js .

# Persistence directory (Fly volume mounts here)
RUN mkdir -p /ydata

# Make binding explicit via env vars
ENV HOST=0.0.0.0
ENV PORT=1234
ENV YPERSISTENCE=/ydata

EXPOSE 1234

# Run the custom server
CMD ["node", "server.js"]
