FROM node:24-trixie-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
CMD ["node", "/opt/services/bh-mcp-gateway/server/gateway.mjs"]
