# Build context: repository root (see docker-compose.prod.yml)
FROM node:22-alpine AS web
WORKDIR /web
COPY ims-web/package.json ims-web/package-lock.json ./
RUN npm ci
COPY ims-web/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production WEB_DIST=/app/web PORT=3000
WORKDIR /app
COPY ims-gateway/package.json ims-gateway/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY ims-gateway/src ./src
COPY --from=web /web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "src/app.js"]
