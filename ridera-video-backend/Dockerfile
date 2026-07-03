FROM node:20-slim

# Chromium para Puppeteer + FFmpeg para grabar
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY src ./src

EXPOSE 3000
CMD ["node", "src/server.js"]
