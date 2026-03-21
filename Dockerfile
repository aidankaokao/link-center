FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY data/links.json ./data/links.json
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]
