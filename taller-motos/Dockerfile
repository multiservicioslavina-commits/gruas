# Imagen del software de taller. Node 20 sobre Alpine: ligera y suficiente,
# porque el proyecto no tiene paso de compilación ni dependencias nativas.
FROM node:20-alpine

WORKDIR /app

# Las dependencias van en su propia capa: mientras package.json no cambie,
# reconstruir la imagen no vuelve a bajarlas.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# No correr como root: si algo se escapara del proceso, no sería administrador.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# `npm start` dispara antes `prestart`, que deja el esquema al día.
CMD ["npm", "start"]
