FROM node:20-alpine

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create logs and uploads directories
RUN mkdir -p logs uploads && chown -R nodejs:nodejs logs uploads

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "src/app.js"]
