ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.24
FROM ${BUILD_FROM}

RUN apk add --no-cache \
    bash \
    supervisor \
    python3 \
    py3-pip

# Alpine 3.24 refuses pip installs into the system Python (PEP 668), so the
# add-on's packages live in their own virtualenv.
COPY app/requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r /app/requirements.txt

COPY app/ /app/
COPY supervisord.conf /etc/supervisord.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh

RUN mkdir -p /data

CMD ["/run.sh"]

LABEL \
    io.hass.name="MyLife360 Backend" \
    io.hass.description="Mobile API backend for MyLife360 family tracking" \
    io.hass.arch="aarch64|amd64" \
    io.hass.type="addon" \
    io.hass.version="1.2.5"