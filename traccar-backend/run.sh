#!/usr/bin/with-contenv bashio

bashio::log.info "Starting MyLife360 Backend..."

if [ -z "${TRACCAR_URL:-}" ]; then
    export TRACCAR_URL=$(bashio::config 'traccar_url')
    export TRACCAR_ADMIN_TOKEN=$(bashio::config 'traccar_admin_token')
    export TRACCAR_ADMIN_USER_ID=$(bashio::config 'traccar_admin_user_id')
    export LOG_LEVEL=$(bashio::config 'log_level' 'info' | tr '[:lower:]' '[:upper:]')
fi

bashio::log.info "Traccar URL: ${TRACCAR_URL}"

exec /usr/bin/supervisord -c /etc/supervisord.conf
