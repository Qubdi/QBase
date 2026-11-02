#!/bin/sh

# Replace placeholders in nginx.conf
envsubst '${QUBDI_BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx as this shell's process (exec), so Docker's SIGTERM reaches it
exec nginx -g "daemon off;"
