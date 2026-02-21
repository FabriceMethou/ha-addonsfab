# ARG must be declared before the first FROM to be in global scope
# (required for legacy Docker builder; HA build system overrides via --build-arg)
ARG BUILD_FROM=homeassistant/amd64-base:latest

# Stage 1: build React SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: HA addon runtime (alpine base — no Node.js needed at runtime)
FROM ${BUILD_FROM}

RUN apk add --no-cache \
    bash \
    nginx \
    supervisor \
    python3 \
    py3-aiohttp

COPY --from=frontend-builder /frontend/dist /usr/share/nginx/html
COPY backend/server.py /app/server.py
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisord.conf
COPY run.sh /
RUN chmod +x /run.sh && mkdir -p /run/nginx

CMD ["/run.sh"]

LABEL \
    io.hass.name="Traccar Panel" \
    io.hass.description="Modern Life360-style frontend for Traccar GPS tracking" \
    io.hass.arch="aarch64|amd64" \
    io.hass.type="addon" \
    io.hass.version="0.8.2"
