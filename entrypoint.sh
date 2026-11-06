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

# nginx fails to start on `listen [::]:80` when the host has no IPv6. The stock
# image checks this in its own entrypoint, which this script replaces.
if [ -f /proc/net/if_inet6 ]; then
    LISTEN_IPV6='listen  [::]:80;'
else
    LISTEN_IPV6=''
fi
export LISTEN_IPV6

# Replace placeholders in nginx.conf
envsubst '${QUBDI_BACKEND_URL} ${LISTEN_IPV6}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx as this shell's process (exec), so Docker's SIGTERM reaches it
exec nginx -g "daemon off;"
