FROM node:20-alpine

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Install production dependencies (layer cached)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create runtime directories
RUN mkdir -p logs uploads && chown -R nodejs:nodejs logs uploads

ENV NODE_ENV=production

USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["node", "src/app.js"]
