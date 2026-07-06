FROM node:20-slim

# Chromium para Puppeteer + FFmpeg + dbus (Chromium moderno lo exige al arrancar)
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    dbus \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /run/dbus /var/lib/dbus \
    && dbus-uuidgen > /var/lib/dbus/machine-id \
    && cp /var/lib/dbus/machine-id /etc/machine-id

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

EXPOSE 3000
# Arrancar el bus del sistema antes de node — sin él Chromium muere con
# "Failed to connect to socket /run/dbus/system_bus_socket"
CMD ["/bin/sh", "-c", "mkdir -p /run/dbus /tmp/.chromium && (dbus-daemon --system --fork 2>/dev/null || true); exec node src/server.js"]
