FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS builder

ARG VITE_HOST_URL
ARG VITE_APP_URL

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# The backend URL is not baked in: nginx serves it at run time through
# /config.js (QUBDI_BACKEND_URL), so one image fits every environment.
RUN printf 'VITE_HOST_URL=%s\nVITE_APP_URL=%s\n' "${VITE_HOST_URL}" "${VITE_APP_URL}" > .env

RUN npm run build

FROM nginx:stable-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5 AS production

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY ./default.conf.template /etc/nginx/conf.d/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
