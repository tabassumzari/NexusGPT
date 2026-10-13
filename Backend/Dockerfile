FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# install only production dependencies (cached unless package files change)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# don't run as root inside the container
USER node

EXPOSE 8080

# Docker marks the container "unhealthy" if the API stops answering
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/api/health" > /dev/null || exit 1

CMD ["node", "server.js"]
