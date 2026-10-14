# Build from the repo root: docker build -f server/Dockerfile .
# The server imports ../shared, so both folders are copied.
FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
COPY shared/ ../shared/
EXPOSE 3001
CMD ["npm", "start"]
