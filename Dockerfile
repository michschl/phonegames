# syntax=docker/dockerfile:1

# ---------- Build: compile the PWA ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

# ---------- Runtime: API server + static files ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    CLIENT_DIR=/app/dist/client
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The server is TypeScript and runs directly via Node's built-in type stripping.
COPY server/src ./server/src
COPY shared ./shared
COPY --from=build /app/dist/client ./dist/client

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]
