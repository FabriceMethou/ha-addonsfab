#!/usr/bin/with-contenv bashio

bashio::log.info "Starting MyLife360 Backend..."

if [ -z "${TRACCAR_URL:-}" ]; then
    export TRACCAR_URL=$(bashio::config 'traccar_url')
    export TRACCAR_OSMAND_URL=$(bashio::config 'traccar_osmand_url')
    export TRACCAR_ADMIN_TOKEN=$(bashio::config 'traccar_admin_token')
    export TRACCAR_ADMIN_USER_ID=$(bashio::config 'traccar_admin_user_id')
    export LOG_LEVEL=$(bashio::config 'log_level' 'info')
fi

bashio::log.info "Traccar URL (internal): ${TRACCAR_URL}"
bashio::log.info "Traccar OsmAnd URL (sent to app): ${TRACCAR_OSMAND_URL}"

exec /usr/bin/supervisord -c /etc/supervisord.conf
