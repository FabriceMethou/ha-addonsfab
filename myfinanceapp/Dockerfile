# ARG BUILD_FROM
# FROM $BUILD_FROM

# # Set shell
# SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# # Install requirements for add-on
# RUN \
#     apk add --no-cache \
#         python3 \
#         py3-pip \
#         curl

# # Set working directory
# WORKDIR /app

# # Copy application files
# COPY app/ /app/

# # Existing step to install basic runtime dependencies
# RUN apk add --no-cache python3 py3-pip curl

# # NEW STEP: Install build tools needed for packages like scikit-learn
# RUN apk add --no-cache build-base
# # Install Python dependencies
# RUN pip3 install --break-system-packages --no-cache-dir -r /app/requirements.txt

# # Copy run script
# COPY run.sh /
# RUN chmod a+x /run.sh

# # Labels
# LABEL \
#     io.hass.name="Finance Tracker" \
#     io.hass.description="Personal finance management with transaction tracking and reporting" \
#     io.hass.arch="armhf|armv7|aarch64|amd64|i386" \
#     io.hass.type="addon" \
#     io.hass.version="1.0.0" \
#     maintainer="Fabrice Methou" \
#     org.opencontainers.image.title="Finance Tracker" \
#     org.opencontainers.image.description="Personal finance management application" \
#     org.opencontainers.image.vendor="Home Assistant Community Add-ons" \
#     org.opencontainers.image.authors="Fabrice Methou" \
#     org.opencontainers.image.licenses="MIT" \
#     org.opencontainers.image.url="https://github.com/FabriceMethou/myfinanceapp" \
#     org.opencontainers.image.source="https://github.com/FabriceMethou/myfinanceapp" \
#     org.opencontainers.image.documentation="https://github.com/FabriceMethou/myfinanceapp/blob/main/README.md"

# syntax=docker/dockerfile:1.4
ARG BUILD_FROM="ghcr.io/home-assistant/amd64-base:latest"
FROM $BUILD_FROM

# Set shell (optional)
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Set the application's working directory
WORKDIR /app

# Copy the application code and requirements.txt
COPY app/ /app/

# The Critical Fix: Install all build tools, install Python dependencies, then clean up.
# This ensures gfortran, the C/C++ compilers, and OpenBLAS headers are present 
# for scikit-learn's internal C extension compilation.
# ... (rest of the Dockerfile remains the same)

# CRITICAL FIX: Comprehensive build dependencies for scikit-learn/scipy on Alpine.
# This ensures all compilers (C/C++/Fortran) and optimized numerical libraries (OpenBLAS) 
# are available during the pip installation.
RUN \
    # 1. Install core dependencies and critical build packages
    apk add --no-cache \
        python3 \
        py3-pip \
        curl \
        # Compilers and base tools:
        build-base \
        gfortran \
        # Numerical Libraries (Headers + Runtime):
        openblas \
        openblas-dev \
    \
    # 2. Install Python dependencies (scikit-learn should now compile successfully)
    && pip3 install --break-system-packages --no-cache-dir -r /app/requirements.txt \
    \
    # 3. Clean up build/dev tools to reduce the final image size
    && apk del build-base gfortran openblas-dev
    
# ... (rest of the Dockerfile remains the same)
# Copy and set execution permissions for the run script
COPY run.sh /run.sh
RUN chmod a+x /run.sh

# Set the primary command
CMD [ "/run.sh" ]

# Labels (Metadata for Home Assistant Add-on Store)
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