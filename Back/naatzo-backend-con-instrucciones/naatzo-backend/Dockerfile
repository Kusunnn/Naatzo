# Imagen del backend de Naatzo. La usa docker-compose.yml.
# Node 22: Octokit 22 se carga con require() de ESM.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=4000
EXPOSE 4000
# Aplica las migraciones pendientes y arranca la API.
CMD ["sh", "-c", "node src/db/migrate.js && node src/index.js"]
