#!/bin/sh

# Replace placeholders in nginx.conf
envsubst '${QUBDI_BACKEND_URL} ${HIDE_CLOUD} ${DISABLE_ANALYTICS}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx
nginx -g "daemon off;"
