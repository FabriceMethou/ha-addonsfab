ARG BUILD_FROM
FROM $BUILD_FROM

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install requirements for add-on
RUN \
    apk add --no-cache \
        python3 \
        py3-pip \
        curl

# Python packages
COPY requirements.txt /tmp/
RUN \
    pip3 install --no-cache-dir -r /tmp/requirements.txt && \
    rm -f /tmp/requirements.txt

# Copy application files
WORKDIR /app
COPY app.py .
COPY database.py .
COPY reports.py .
COPY predictions.py .
COPY categorizer.py .
COPY alerts.py .
COPY backup_manager.py .
COPY cloud_backup.py .
COPY auth.py .
COPY login_page.py .
COPY isin_lookup.py .
COPY utils.py .
COPY validators.py .

# Copy scripts directory
COPY scripts/ /app/scripts/

# Create data directory
RUN mkdir -p /app/data

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

# Labels
LABEL \
    io.hass.name="Finance Tracker" \
    io.hass.description="Personal finance management with transaction tracking and reporting" \
    io.hass.arch="armhf|armv7|aarch64|amd64|i386" \
    io.hass.type="addon" \
    io.hass.version="1.0.0" \
    maintainer="Your Name <your.email@example.com>" \
    org.opencontainers.image.title="Finance Tracker" \
    org.opencontainers.image.description="Personal finance management application" \
    org.opencontainers.image.vendor="Home Assistant Community Add-ons" \
    org.opencontainers.image.authors="Your Name <your.email@example.com>" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/yourusername/finance-tracker" \
    org.opencontainers.image.source="https://github.com/yourusername/finance-tracker" \
    org.opencontainers.image.documentation="https://github.com/yourusername/finance-tracker/blob/main/README.md"

CMD [ "/run.sh" ]
