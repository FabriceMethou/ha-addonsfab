#!/usr/bin/with-contenv bashio

# Read config options
POSTGRES_USER=$(bashio::config 'POSTGRES_USER')
POSTGRES_PASSWORD=$(bashio::config 'POSTGRES_PASSWORD')
POSTGRES_DB=$(bashio::config 'POSTGRES_DB')
SECRET_KEY_BASE=$(bashio::config 'SECRET_KEY_BASE')
TIME_ZONE=$(bashio::config 'TIME_ZONE')
APPLICATION_HOSTS=$(bashio::config 'APPLICATION_HOSTS')
APPLICATION_PROTOCOL=$(bashio::config 'APPLICATION_PROTOCOL')
BACKGROUND_PROCESSING_CONCURRENCY=$(bashio::config 'BACKGROUND_PROCESSING_CONCURRENCY')

DATA_DIR="/data/dawarich"
PG_DATA="${DATA_DIR}/postgresql"
REDIS_DATA="${DATA_DIR}/redis"

# ===== Create persistent data directories =====
mkdir -p "${PG_DATA}" "${REDIS_DATA}" "${DATA_DIR}/storage" "${DATA_DIR}/public"

# ===== Start PostgreSQL =====
bashio::log.info "Starting PostgreSQL..."

if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    bashio::log.info "Initializing PostgreSQL database..."
    chown -R postgres:postgres "${PG_DATA}"
    su-exec postgres initdb -D "${PG_DATA}"
    # Allow local connections
    echo "host all all 0.0.0.0/0 md5" >> "${PG_DATA}/pg_hba.conf"
    echo "local all all trust" >> "${PG_DATA}/pg_hba.conf"
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '127.0.0.1'/" "${PG_DATA}/postgresql.conf"
    sed -i "s/shared_buffers = 128MB/shared_buffers = 256MB/" "${PG_DATA}/postgresql.conf"
fi

chown -R postgres:postgres "${PG_DATA}" /run/postgresql
su-exec postgres pg_ctl -D "${PG_DATA}" -l "${DATA_DIR}/postgresql.log" start

# Wait for PostgreSQL to be ready
until su-exec postgres pg_isready -h 127.0.0.1; do
    bashio::log.info "Waiting for PostgreSQL..."
    sleep 1
done

# Create user and database if needed
su-exec postgres psql -h 127.0.0.1 -tc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | grep -q 1 || \
    su-exec postgres psql -h 127.0.0.1 -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}' SUPERUSER;"

su-exec postgres psql -h 127.0.0.1 -tc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 || \
    su-exec postgres psql -h 127.0.0.1 -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

# Enable PostGIS extension
su-exec postgres psql -h 127.0.0.1 -d "${POSTGRES_DB}" -c "CREATE EXTENSION IF NOT EXISTS postgis;" || true

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
export APPLICATION_HOSTS="${APPLICATION_HOSTS}"
export APPLICATION_PROTOCOL="${APPLICATION_PROTOCOL}"
export TIME_ZONE="${TIME_ZONE}"
export SECRET_KEY_BASE="${SECRET_KEY_BASE}"
export RAILS_LOG_TO_STDOUT="true"
export SELF_HOSTED="true"
export STORE_GEODATA="true"
export PROMETHEUS_EXPORTER_ENABLED="false"

cd /app

# ===== Run database migrations =====
bashio::log.info "Running database migrations..."
bundle exec rails db:prepare 2>&1 || true

# ===== Start Sidekiq in background =====
bashio::log.info "Starting Sidekiq..."
export BACKGROUND_PROCESSING_CONCURRENCY="${BACKGROUND_PROCESSING_CONCURRENCY}"
bundle exec sidekiq &

# ===== Start Dawarich app =====
bashio::log.info "Starting Dawarich application on port 3000..."
exec bundle exec rails server -b 0.0.0.0 -p 3000
