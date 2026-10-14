# Build from the repo root: docker build -f server/Dockerfile .
# The server imports ../shared (and the editor's metadata types), so those are copied too.
FROM node:22-alpine AS build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
COPY shared/ ../shared/
COPY src/lib/data/import-metadata/metadata-types/ ../src/lib/data/import-metadata/metadata-types/
# the copied editor types import zod: let them find the server's copy
RUN ln -s /app/server/node_modules /app/node_modules \
    && npm run build \
    && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
EXPOSE 3001
CMD ["node", "dist/server/src/server.js"]
