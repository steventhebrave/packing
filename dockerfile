FROM node:20-alpine
WORKDIR /app

# Minimal package; install server
RUN npm init -y && npm install @y/websocket-server

# Persistence directory (Fly volume mounts here)
RUN mkdir -p /ydata

# Make binding explicit via env vars
ENV HOST=0.0.0.0
ENV PORT=1234
ENV YPERSISTENCE=/ydata

EXPOSE 1234

# Run the server (no shell, no flags; envs do the work)
CMD ["npx","y-websocket"]
