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

# Set working directory
WORKDIR /app

# Copy application files
COPY app/ /app/

# Install Python dependencies
RUN pip3 install --break-system-packages --no-cache-dir -r /app/requirements.txt

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
    maintainer="Fabrice Methou" \
    org.opencontainers.image.title="Finance Tracker" \
    org.opencontainers.image.description="Personal finance management application" \
    org.opencontainers.image.vendor="Home Assistant Community Add-ons" \
    org.opencontainers.image.authors="Fabrice Methou" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/FabriceMethou/myfinanceapp" \
    org.opencontainers.image.source="https://github.com/FabriceMethou/myfinanceapp" \
    org.opencontainers.image.documentation="https://github.com/FabriceMethou/myfinanceapp/blob/main/README.md"

CMD [ "/run.sh" ]
