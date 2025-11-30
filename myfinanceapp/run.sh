#!/usr/bin/with-contenv bashio

# /app/data is used by the application for persistent storage
# we keep it persistent in /data/myfinanceapp/data

DATA_MARKER="/data/myfinanceapp/data_initialized"

# Check if data directory is already initialized
if [ -f "$DATA_MARKER" ]; then
    echo "Data already initialized, using existing data"
    rm -rf /app/data
    ln -s /data/myfinanceapp/data /app/data
else
    echo "Initializing data directory for first time"

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

# Start the Streamlit application
cd /app || exit 1

exec streamlit run app.py \
    --server.port=8501 \
    --server.address=0.0.0.0 \
    --server.headless=true \
    --server.enableCORS=false \
    --server.enableXsrfProtection=true \
    --browser.serverAddress="0.0.0.0" \
    --browser.gatherUsageStats=false
