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
    chmod 777 -R /data/myfinanceapp

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
export DATABASE_PATH="/app/data/finance.db"

# Get JWT secret from options or use default (not recommended for production)
if bashio::config.has_value 'jwt_secret'; then
    export JWT_SECRET_KEY=$(bashio::config 'jwt_secret')
    bashio::log.info "Using JWT secret from configuration"
else
    export JWT_SECRET_KEY="change-this-secret-key-in-production"
    bashio::log.warning "Using default JWT secret - please set 'jwt_secret' in addon configuration!"
fi

# Optional: Get API URL configuration
if bashio::config.has_value 'api_url'; then
    export API_URL=$(bashio::config 'api_url')
    bashio::log.info "API URL set to: $API_URL"
fi

# =============================================================================
# Create Log Directory
# =============================================================================
mkdir -p /var/log
touch /var/log/backend.out.log /var/log/backend.err.log
touch /var/log/nginx.out.log /var/log/nginx.err.log

# =============================================================================
# Start Services using Supervisor
# =============================================================================
bashio::log.info "Starting backend (FastAPI) and frontend (nginx)..."
bashio::log.info "Web interface will be available on port 8501"
bashio::log.info "Backend API will be available at /api"

# Start supervisor to manage both services
exec /usr/bin/supervisord -c /etc/supervisord.conf
