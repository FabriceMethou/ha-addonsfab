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

# CMD [ "/run.sh" ]
ARG BUILD_FROM
FROM $BUILD_FROM

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

## 1. SET UP CONTEXT 
# Define the working directory.
WORKDIR /app

# Copy application files (including requirements.txt) FIRST.
# This makes the /app/requirements.txt file available for the next step.
COPY app/ /app/

## 2. INSTALLATION, COMPILATION, AND CLEANUP (FINAL FIX)
RUN \
    # 1. Install core dependencies (python, pip, curl), build tools (build-base),
    #    and numerical compilation dependencies (openblas-dev)
    apk add --no-cache \
        python3 \
        py3-pip \
        curl \
        build-base \
        openblas-dev \
    \
    # 2. Install Python dependencies. openblas-dev helps scikit-learn compile properly.
    && pip3 install --break-system-packages --no-cache-dir -r /app/requirements.txt \
    \
    # 3. Remove build tools package and development libraries to reduce final image size
    && apk del build-base openblas-dev
## 3. FINAL STEPS
# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

# Labels (Rest of the file remains the same)
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