# Node 24 (current LTS). Stateless — no DB, no migration job.
FROM node:24-alpine AS base

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY src ./src
COPY public ./public

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
