ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install PostgreSQL, PostGIS, Redis, and dependencies
RUN apk add --no-cache \
    postgresql17 \
    postgresql17-contrib \
    postgis \
    redis \
    bash \
    curl \
    su-exec \
    && mkdir -p /run/postgresql /var/lib/postgresql/data \
    && chown -R postgres:postgres /run/postgresql /var/lib/postgresql

# Pull the Dawarich application image contents
COPY --from=freikin/dawarich:latest /app /app
COPY --from=freikin/dawarich:latest /usr/local/bundle /usr/local/bundle

# Install Ruby runtime needed by the app
RUN apk add --no-cache \
    ruby \
    ruby-bundler \
    libpq \
    gcompat \
    nodejs \
    yarn \
    tzdata \
    geos \
    proj \
    gdal

WORKDIR /app

COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
