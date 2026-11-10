# One image: the API serves the built editor itself (see server/src/web.ts), so
# there is one container, one port and no CORS to set up.
# Build from the repo root: docker build -t qubdi/qbase .

# --- the editor ---
# Plain JavaScript, the same for every platform: built once, on the machine that
# runs the build (BUILDPLATFORM), and copied into each platform's image. Built
# per platform, the arm64 copy would run under emulation, many times slower.
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS web
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The backend URL is not baked in: the server answers /config.js itself, pointing
# the editor at its own /api.
# typecheck and bundle; no lint here: CI lints every change before an image is made.
# .dockerignore leaves the tests out of the build, so the check skips them too
# (tsconfig.image.json); CI checks them with `tsc -b`.
RUN npx tsc -p tsconfig.image.json && npx vite build
# a .br and .gz beside each large file; the server sends those (see server/src/web.ts)
RUN node server/scripts/precompress-web.mjs dist

# --- the server ---
# The server imports ../shared (and the editor's metadata types), so those are copied too.
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS server
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

# --- the image ---
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
ENV NODE_ENV=production
# the image is reached through the container network, so it listens on every interface
ENV HOST=0.0.0.0
# the built editor the server serves; with it set, the API is under /api
ENV WEB_DIR=/app/web
WORKDIR /app/server
COPY --from=server /app/server/package.json ./
COPY --from=server /app/server/node_modules ./node_modules
COPY --from=server /app/server/dist ./dist
COPY --from=web /usr/src/app/dist /app/web
# nothing here writes to disk: run as the unprivileged user the image provides
USER node
EXPOSE 3001
# the server answers /health once it is listening; a hung process shows as unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>{process.exitCode=r.ok?0:1},()=>{process.exitCode=1})"
CMD ["node", "dist/server/src/server.js"]
