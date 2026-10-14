FROM node:24-alpine AS builder

ARG VITE_HIDE_CLOUD
ARG VITE_DISABLE_ANALYTICS
ARG VITE_QUBDI_BACKEND_URL
ARG VITE_HOST_URL

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN echo "VITE_HIDE_CLOUD=${VITE_HIDE_CLOUD}" > .env && \
    echo "VITE_DISABLE_ANALYTICS=${VITE_DISABLE_ANALYTICS}" >> .env && \
    echo "VITE_QUBDI_BACKEND_URL=${VITE_QUBDI_BACKEND_URL}" >> .env && \n    echo "VITE_HOST_URL=${VITE_HOST_URL}" >> .env

RUN npm run build

FROM nginx:stable-alpine AS production

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY ./default.conf.template /etc/nginx/conf.d/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]