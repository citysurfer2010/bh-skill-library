FROM node:24-trixie-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
USER node
ENV HOST=0.0.0.0 DATA_DIR=/data
EXPOSE {{PORT}}
CMD ["node", "server.js"]
