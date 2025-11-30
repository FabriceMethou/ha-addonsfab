#!/usr/bin/with-contenv bashio
# ==============================================================================
# Home Assistant Add-on: Finance Tracker
# Runs the Finance Tracker Streamlit application
# ==============================================================================

bashio::log.info "Starting Finance Tracker..."

# Get configuration options
DATA_DIR=$(bashio::config 'data_dir')
BACKUP_DIR=$(bashio::config 'backup_dir')
TIMEZONE=$(bashio::config 'timezone')
THEME=$(bashio::config 'theme')

# Set timezone
bashio::log.info "Setting timezone to ${TIMEZONE}"
export TZ="${TIMEZONE}"

# Create directories if they don't exist
bashio::log.info "Setting up data directory: ${DATA_DIR}"
mkdir -p "${DATA_DIR}"
mkdir -p "${DATA_DIR}/backups"

if [ -n "${BACKUP_DIR}" ]; then
    bashio::log.info "Setting up backup directory: ${BACKUP_DIR}"
    mkdir -p "${BACKUP_DIR}"
fi

# Set permissions
chmod -R 755 "${DATA_DIR}"

# Create symlink to data directory so app uses it
ln -sf "${DATA_DIR}" /app/data

# Set Streamlit configuration
export STREAMLIT_SERVER_PORT=8501
export STREAMLIT_SERVER_ADDRESS=0.0.0.0
export STREAMLIT_SERVER_HEADLESS=true
export STREAMLIT_SERVER_ENABLE_CORS=false
export STREAMLIT_SERVER_ENABLE_XSRF_PROTECTION=true

# Set theme if specified
if [ "${THEME}" = "dark" ]; then
    export STREAMLIT_THEME_BASE="dark"
elif [ "${THEME}" = "light" ]; then
    export STREAMLIT_THEME_BASE="light"
fi

# Display configuration
bashio::log.info "Configuration:"
bashio::log.info " - Data directory: ${DATA_DIR}"
bashio::log.info " - Backup directory: ${BACKUP_DIR}"
bashio::log.info " - Timezone: ${TIMEZONE}"
bashio::log.info " - Theme: ${THEME}"
bashio::log.info " - Web interface will be available on port 8501"

# Start the application
bashio::log.info "Starting Streamlit application..."
cd /app || exit 1

exec streamlit run app.py \
    --server.port="${STREAMLIT_SERVER_PORT}" \
    --server.address="${STREAMLIT_SERVER_ADDRESS}" \
    --server.headless=true \
    --server.enableCORS=false \
    --server.enableXsrfProtection=true \
    --browser.serverAddress="0.0.0.0" \
    --browser.gatherUsageStats=false
