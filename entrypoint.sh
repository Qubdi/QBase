#!/bin/sh

# QUBDI_BACKEND_URL is written into config.js, the Content-Security-Policy
# header and the nginx config, so it must be a plain http(s) origin: a scheme,
# a host and an optional port. Nothing else (no quotes, spaces, semicolons or
# braces) gets through. Empty stays allowed: the editor then runs local-only.
if [ -n "${QUBDI_BACKEND_URL:-}" ]; then
    if ! printf '%s' "$QUBDI_BACKEND_URL" | grep -Eq '^https?://([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(:[0-9]{1,5})?/?$'; then
        echo "QUBDI_BACKEND_URL must be a plain http(s) origin such as https://api.example.com or http://localhost:3001" >&2
        exit 1
    fi
fi

# Replace placeholders in nginx.conf
envsubst '${QUBDI_BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx as this shell's process (exec), so Docker's SIGTERM reaches it
exec nginx -g "daemon off;"
