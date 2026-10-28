# Build from the repo root: docker build -f server/Dockerfile .
# The server imports ../shared (and the editor's metadata types), so those are copied too.
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build
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

FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
ENV NODE_ENV=production
# the image is reached through the container network, so it listens on every interface
ENV HOST=0.0.0.0
WORKDIR /app/server
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
# nothing here writes to disk: run as the unprivileged user the image provides
USER node
EXPOSE 3001
# the server answers /health once it is listening; a hung process shows as unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>{process.exitCode=r.ok?0:1},()=>{process.exitCode=1})"
CMD ["node", "dist/server/src/server.js"]
