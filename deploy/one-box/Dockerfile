# One-box: UI + API in a single long-lived Node process.
# Sheets stay in Google via Apps Script (BRIDGE_* env). Not bundled here.
FROM node:20-alpine

WORKDIR /app

# Zero runtime npm deps — copy lock for reproducibility only.
COPY package.json package-lock.json ./
COPY middleware ./middleware
COPY frontend ./frontend
COPY scripts/keep-render-awake.sh ./scripts/keep-render-awake.sh

RUN mkdir -p /app/data \
  && addgroup -S ts3 && adduser -S ts3 -G ts3 \
  && chown -R ts3:ts3 /app

USER ts3

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4303

EXPOSE 4303

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4303/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "middleware/server.js"]
