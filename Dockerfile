# Node 20 reached end of life in March 2026. Keep build and runtime on the
# supported Node 24 LTS line.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ── Minimal runtime stage ───────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# non-root user
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

# Pre-create the uploads dir with ownership so the named volume
# (uploads_data:/app/uploads) inherits writable perms instead of root-owned.
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]

STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/main.js"]
