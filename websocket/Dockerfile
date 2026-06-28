FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY src/ ./src/
RUN npx esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/index.js \
    --external:bufferutil --external:utf-8-validate

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist/index.js ./
EXPOSE 3000
CMD ["node", "index.js"]
