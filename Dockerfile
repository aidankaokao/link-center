# ── Stage 1: Frontend build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app

# 安裝 wget + ca-certificates（用於下載 piper binary）
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 安裝 piper binary（依架構選版本）
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then PARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then PARCH="aarch64"; \
    fi && \
    wget -q -O /tmp/piper.tgz \
      "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_${PARCH}.tar.gz" && \
    mkdir -p /app/bin && \
    tar -xzf /tmp/piper.tgz -C /app/bin && \
    rm /tmp/piper.tgz

# 安裝 server 端依賴
COPY package-server.json ./package.json
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY data/links.json ./data/links.json
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]
