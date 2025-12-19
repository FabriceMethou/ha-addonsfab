# syntax=docker/dockerfile:1.4

# Base image for the final Home Assistant add-on (can be overridden by the build system)
ARG BUILD_FROM="ghcr.io/home-assistant/amd64-base:latest"

#
# Stage 1: Build the React frontend
#
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm ci

# Build frontend assets
COPY frontend/ ./
RUN npm run build

#
# Stage 2: Home Assistant add-on image
#
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Core packages for python, nginx, supervisor, and HA helpers
RUN apk add --no-cache \
    bash \
    curl \
    nginx \
    supervisor \
    python3 \
    py3-pip \
    py3-joblib \
    py3-numpy \
    py3-pandas \
    py3-pillow \
    py3-scikit-learn \
    py3-scipy \
    libffi \
    openssl \
    openblas \
    tzdata

# Python dependencies (use build deps only while installing)
COPY app/backend/requirements.txt /tmp/requirements.txt
RUN apk add --no-cache --virtual .build-deps \
        build-base \
        python3-dev \
        libffi-dev \
        openssl-dev \
    && sed -E '/^(pandas|scikit-learn|joblib|pillow)==/d' /tmp/requirements.txt > /tmp/requirements.pip.txt \
    && PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install --no-cache-dir -r /tmp/requirements.pip.txt \
    && apk del .build-deps

# Application code
COPY app/backend /app/backend
COPY app/*.py /app/
COPY uvicorn_log.json /app/uvicorn_log.json
RUN mkdir -p /app/data

# Frontend assets served by nginx
COPY --from=frontend-builder /frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Supervisor and startup script
COPY supervisord.conf /etc/supervisord.conf
COPY run.sh /run.sh

RUN chmod a+x /run.sh \
    && mkdir -p /run/nginx /var/log/supervisor /data/myfinanceapp/data

EXPOSE 8501

CMD [ "/run.sh" ]

LABEL \
    io.hass.name="Finance Tracker" \
    io.hass.description="Personal finance management with transaction tracking and reporting" \
    io.hass.arch="armhf|armv7|aarch64|amd64|i386" \
    io.hass.type="addon" \
    io.hass.version="2.0.6" \
    maintainer="Fabrice Methou" \
    org.opencontainers.image.title="Finance Tracker" \
    org.opencontainers.image.description="Personal finance management application with React frontend and FastAPI backend" \
    org.opencontainers.image.vendor="Home Assistant Community Add-ons" \
    org.opencontainers.image.authors="Fabrice Methou" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/FabriceMethou/myfinanceapp" \
    org.opencontainers.image.source="https://github.com/FabriceMethou/myfinanceapp" \
    org.opencontainers.image.documentation="https://github.com/FabriceMethou/myfinanceapp/blob/main/README.md"
