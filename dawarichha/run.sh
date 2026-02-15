#!/usr/bin/with-contenv bashio

# Read config options
POSTGRES_USER=$(bashio::config 'POSTGRES_USER')
POSTGRES_PASSWORD=$(bashio::config 'POSTGRES_PASSWORD')
POSTGRES_DB=$(bashio::config 'POSTGRES_DB')
SECRET_KEY_BASE=$(bashio::config 'SECRET_KEY_BASE')
TIME_ZONE=$(bashio::config 'TIME_ZONE')
LOCAL_HOST=$(bashio::config 'LOCAL_HOST')
EXTERNAL_HOST=$(bashio::config 'EXTERNAL_HOST')
APPLICATION_PROTOCOL=$(bashio::config 'APPLICATION_PROTOCOL')
BACKGROUND_PROCESSING_CONCURRENCY=$(bashio::config 'BACKGROUND_PROCESSING_CONCURRENCY')

DATA_DIR="/data/dawarich"
PG_DATA="${DATA_DIR}/postgresql"
REDIS_DATA="${DATA_DIR}/redis"

# ===== Create persistent data directories =====
mkdir -p "${PG_DATA}" "${REDIS_DATA}" "${DATA_DIR}/storage" "${DATA_DIR}/public"

# ===== Start PostgreSQL =====
bashio::log.info "Starting PostgreSQL..."

PG_EXPECTED_VERSION="17"
NEED_INIT=false

if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    NEED_INIT=true
elif [ "$(cat "${PG_DATA}/PG_VERSION")" != "${PG_EXPECTED_VERSION}" ]; then
    bashio::log.warning "PostgreSQL data version $(cat "${PG_DATA}/PG_VERSION") does not match installed version ${PG_EXPECTED_VERSION}. Re-initializing..."
    rm -rf "${PG_DATA}"
    mkdir -p "${PG_DATA}"
    NEED_INIT=true
fi

if [ "${NEED_INIT}" = true ]; then
    bashio::log.info "Initializing PostgreSQL database..."
    chown -R postgres:postgres "${PG_DATA}"
    gosu postgres /usr/lib/postgresql/17/bin/initdb -D "${PG_DATA}"
    # Allow local connections
    echo "host all all 0.0.0.0/0 md5" >> "${PG_DATA}/pg_hba.conf"
    echo "local all all trust" >> "${PG_DATA}/pg_hba.conf"
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '127.0.0.1'/" "${PG_DATA}/postgresql.conf"
fi

chown -R postgres:postgres "${DATA_DIR}" /run/postgresql
if ! gosu postgres /usr/lib/postgresql/17/bin/pg_ctl -D "${PG_DATA}" -l "${DATA_DIR}/postgresql.log" start; then
    bashio::log.error "PostgreSQL failed to start. Log output:"
    cat "${DATA_DIR}/postgresql.log" >&2
    exit 1
fi

# Wait for PostgreSQL to be ready
until gosu postgres pg_isready -h 127.0.0.1; do
    bashio::log.info "Waiting for PostgreSQL..."
    sleep 1
done

# Create user and database if needed
gosu postgres psql -h 127.0.0.1 -tc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | grep -q 1 || \
    gosu postgres psql -h 127.0.0.1 -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}' SUPERUSER;"

gosu postgres psql -h 127.0.0.1 -tc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 || \
    gosu postgres psql -h 127.0.0.1 -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

# Enable PostGIS extension
gosu postgres psql -h 127.0.0.1 -d "${POSTGRES_DB}" -c "CREATE EXTENSION IF NOT EXISTS postgis;" || true

# ===== Start Redis =====
bashio::log.info "Starting Redis..."
redis-server --daemonize yes --dir "${REDIS_DATA}" --appendonly yes

until redis-cli ping 2>/dev/null | grep -q PONG; do
    bashio::log.info "Waiting for Redis..."
    sleep 1
done

# ===== Set up environment for Dawarich =====
export RAILS_ENV="production"
export REDIS_URL="redis://127.0.0.1:6379/0"
export DATABASE_HOST="127.0.0.1"
export DATABASE_PORT="5432"
export DATABASE_USERNAME="${POSTGRES_USER}"
export DATABASE_PASSWORD="${POSTGRES_PASSWORD}"
export DATABASE_NAME="${POSTGRES_DB}"
# Build APPLICATION_HOSTS from local + external
if [ -n "${EXTERNAL_HOST}" ]; then
    export APPLICATION_HOSTS="${LOCAL_HOST},${EXTERNAL_HOST}"
else
    export APPLICATION_HOSTS="${LOCAL_HOST}"
fi
export APPLICATION_PROTOCOL="${APPLICATION_PROTOCOL}"
export TIME_ZONE="${TIME_ZONE}"
export SECRET_KEY_BASE="${SECRET_KEY_BASE}"
export RAILS_LOG_TO_STDOUT="true"
export SELF_HOSTED="true"
export STORE_GEODATA="true"
export PROMETHEUS_EXPORTER_ENABLED="false"

cd /var/app

# ===== Diagnostics =====
bashio::log.info "Ruby version: $(ruby --version)"
bashio::log.info "Bundle path: $(bundle config path 2>&1 | tail -1)"
bashio::log.info "GEM_HOME=${GEM_HOME}"
bashio::log.info "BUNDLE_PATH=${BUNDLE_PATH}"
bashio::log.info "Checking rails gem..."
bundle show rails 2>&1 | head -3 | while read -r line; do bashio::log.info "  ${line}"; done

# ===== Run database migrations =====
bashio::log.info "Running database migrations..."
if ! bundle exec rails db:prepare 2>&1; then
    bashio::log.warning "Database migration had issues, continuing..."
fi

# ===== Start Sidekiq in background =====
bashio::log.info "Starting Sidekiq..."
export BACKGROUND_PROCESSING_CONCURRENCY="${BACKGROUND_PROCESSING_CONCURRENCY}"
bundle exec sidekiq &

# ===== Start HA Bridge if enabled =====
HA_BRIDGE_ENABLED=$(bashio::config 'HA_BRIDGE_ENABLED')
if [ "${HA_BRIDGE_ENABLED}" = "true" ]; then
    bashio::log.info "Starting smart HA-to-Dawarich location bridge..."
    python3 /ha_bridge.py &
else
    bashio::log.info "HA Bridge is disabled. Set HA_BRIDGE_ENABLED to true to send HA locations to Dawarich."
fi

# ===== Start Dawarich app =====
bashio::log.info "Starting Dawarich application on port 3000..."
exec bundle exec rails server -b 0.0.0.0 -p 3000
