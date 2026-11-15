# Headless Chromium from the official Playwright image; the app only adds playwright-core and its own code.
FROM mcr.microsoft.com/playwright:v1.65.0-noble
WORKDIR /worker
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --silent && npm cache clean --force
COPY server.js ./
COPY lib ./lib
USER pwuser
ENV NODE_ENV=production STATE_DIR=/state TOKEN_FILE=/run/bh-amazon/token PORT=3800
CMD ["node", "server.js"]
