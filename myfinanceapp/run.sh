#!/usr/bin/with-contenv bashio

# =============================================================================
# Home Assistant Finance Tracker Add-on
# Starts FastAPI backend and React frontend (served by nginx)
# =============================================================================

set -e

bashio::log.info "Starting Finance Tracker Add-on..."

# =============================================================================
# Setup Data Directory
# =============================================================================
DATA_MARKER="/data/myfinanceapp/data_initialized"

# Check if data directory is already initialized
if [ -f "$DATA_MARKER" ]; then
    bashio::log.info "Data already initialized, using existing data"
    rm -rf /app/data
    ln -s /data/myfinanceapp/data /app/data
else
    bashio::log.info "Initializing data directory for first time"

    mkdir -p /data/myfinanceapp/data
    # 750 is enough: the add-on runs as a single user inside its own
    # container, and this directory holds the household's finances.
    chmod 750 -R /data/myfinanceapp

    # If /app/data exists from the build, move it to persistent storage
    if [ -d /app/data ]; then
        cp -r /app/data/* /data/myfinanceapp/data/ 2>/dev/null || true
    fi

    rm -rf /app/data
    ln -s /data/myfinanceapp/data /app/data

    # Mark as initialized
    touch "$DATA_MARKER"
fi

# =============================================================================
# Set Environment Variables
# =============================================================================
export PYTHONPATH="/app"
# DATA_DIR is the single root every runtime path derives from (see app/paths.py).
# /app/data is a symlink into the add-on's persistent /data volume, set up above.
export DATA_DIR="/app/data"
export DATABASE_PATH="/app/data/finance.db"

# JWT secret: use the configured one, otherwise generate and persist a random
# secret. The add-on used to fall back to a fixed string published in this
# repository, which anyone could use to forge an admin token.
JWT_SECRET_FILE="/data/myfinanceapp/jwt_secret"
CONFIGURED_SECRET=$(bashio::config 'jwt_secret')

if [ -n "$CONFIGURED_SECRET" ] && [ "$CONFIGURED_SECRET" != "change-this-secret-key-in-production" ]; then
    export JWT_SECRET_KEY="$CONFIGURED_SECRET"
    bashio::log.info "Using JWT secret from configuration"
else
    if [ ! -s "$JWT_SECRET_FILE" ]; then
        head -c 48 /dev/urandom | base64 | tr -d '\n' > "$JWT_SECRET_FILE"
        chmod 600 "$JWT_SECRET_FILE"
        bashio::log.info "Generated a new JWT secret (stored in /data, survives restarts)"
    fi
    export JWT_SECRET_KEY=$(cat "$JWT_SECRET_FILE")
    bashio::log.info "Using the generated JWT secret; set 'jwt_secret' to override"
fi

# Credentials for email alerts and WebDAV backups. Empty is fine — the features
# stay disabled rather than failing at use time.
export SMTP_PASSWORD=$(bashio::config 'smtp_password')
export WEBDAV_PASSWORD=$(bashio::config 'webdav_password')

# Optional: Get API URL configuration
if bashio::config.has_value 'api_url'; then
    export API_URL=$(bashio::config 'api_url')
    bashio::log.info "API URL set to: $API_URL"
fi

# =============================================================================
# Start Services using Supervisor
# =============================================================================
bashio::log.info "Starting backend (FastAPI) and frontend (nginx)..."
bashio::log.info "Web interface will be available on port 8501"
bashio::log.info "Backend API will be available at /api"

# Start supervisor to manage both services
exec /usr/bin/supervisord -c /etc/supervisord.conf
