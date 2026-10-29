FROM node:24.22.2-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Bundle the browser's OpenTelemetry setup into public/otel.js.
RUN npm run build:web
CMD ["node", "--require", "./instrumentation.js", "server.js"]
