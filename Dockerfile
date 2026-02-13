FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source and build
COPY . .
RUN npm run build

# Install mcp-proxy globally to wrap stdio → HTTP/SSE
RUN npm install -g mcp-proxy

# Copy entrypoint script
COPY start.sh .
RUN chmod +x start.sh

# Railway sets PORT automatically; default to 8080
ENV PORT=8080

CMD ["./start.sh"]
