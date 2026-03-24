ARG BUILD_FROM=homeassistant/amd64-base:latest
FROM ${BUILD_FROM}

RUN apk add --no-cache \
    bash \
    supervisor \
    python3 \
    py3-pip

COPY app/requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt

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
    io.hass.version="1.0.2"
