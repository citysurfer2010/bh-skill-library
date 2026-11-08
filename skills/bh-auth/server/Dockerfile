FROM node:24-trixie-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
USER node
ENV DATA_DIR=/data
EXPOSE 3337
CMD ["node", "server.js"]
