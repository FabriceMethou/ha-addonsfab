#!/usr/bin/with-contenv bashio

bashio::log.info "Starting Traccar Panel..."

# Only read from HA config when env vars aren't already set.
# This lets you pass -e TRACCAR_URL=... for local Docker testing
# while HA deployment reads from the addon options as usual.
if [ -z "${TRACCAR_URL:-}" ]; then
    export TRACCAR_URL=$(bashio::config 'traccar_url')
    export TRACCAR_USERNAME=$(bashio::config 'traccar_username')
    export TRACCAR_PASSWORD=$(bashio::config 'traccar_password')
fi

bashio::log.info "Traccar URL: ${TRACCAR_URL}"

exec /usr/bin/supervisord -c /etc/supervisord.conf
