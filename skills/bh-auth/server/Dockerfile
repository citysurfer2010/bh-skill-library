FROM node:24-trixie-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
USER node
ENV DATA_DIR=/data
EXPOSE 3337
CMD ["node", "server.js"]
