# ── Stage 1: Frontend build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY package-server.json ./package.json
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY data/links.json ./data/links.json
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]
