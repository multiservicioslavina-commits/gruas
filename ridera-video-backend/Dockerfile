FROM node:20-slim

# El paquete chromium de Debian se instala SOLO para traer las librerías
# compartidas y fuentes que Chrome necesita. NO se usa su binario:
# Debian sirve Chromium v146 y Puppeteer 22 espera Chrome ~127 — ese
# desfase de versiones es lo que rompía el launch en producción.
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

# Chrome for Testing lo instala Puppeteer con SU versión exacta emparejada
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/opt/pptr-cache
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
# Instalar el Chrome for Testing que corresponde EXACTAMENTE a esta
# versión de Puppeteer (recomendación oficial pptr.dev/guides/docker)
RUN PUPPETEER_SKIP_DOWNLOAD= PUPPETEER_SKIP_CHROMIUM_DOWNLOAD= \
    npx puppeteer browsers install chrome
COPY src ./src
COPY assets ./assets

EXPOSE 3000
CMD ["/bin/sh", "-c", "mkdir -p /run/dbus /tmp/.chromium && (dbus-daemon --system --fork 2>/dev/null || true); exec node src/server.js"]
