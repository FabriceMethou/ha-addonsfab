#!/usr/bin/with-contenv bashio

bashio::log.info "Starting MyLife360 Backend..."

if [ -z "${TRACCAR_URL:-}" ]; then
    export TRACCAR_URL=$(bashio::config 'traccar_url')
    export TRACCAR_OSMAND_URL=$(bashio::config 'traccar_osmand_url')
    export TRACCAR_ADMIN_TOKEN=$(bashio::config 'traccar_admin_token')
    export TRACCAR_ADMIN_USER_ID=$(bashio::config 'traccar_admin_user_id')
    export ENROLMENT_CODE=$(bashio::config 'enrolment_code')
    export LOG_LEVEL=$(bashio::config 'log_level' 'info')
fi

# Host only — the full OsmAnd URL is a position-injection capability, so it does
# not belong in a log tab that gets screenshotted into support threads.
bashio::log.info "Traccar host: $(echo "${TRACCAR_URL}" | sed -E 's#^[a-z]+://([^/]+).*#\1#')"

if bashio::config.is_empty 'enrolment_code'; then
    bashio::log.warning "No enrolment_code set — device enrolment is DISABLED."
    bashio::log.warning "Set one in the add-on configuration before installing the app."
fi

exec /usr/bin/supervisord -c /etc/supervisord.conf
