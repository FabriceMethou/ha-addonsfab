ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install PostgreSQL, PostGIS, Redis, and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql \
    postgresql-contrib \
    postgresql-17-postgis-3 \
    redis-server \
    gosu \
    curl \
    libjemalloc2 \
    libgmp10 \
    libpq5 \
    zlib1g \
    libyaml-0-2 \
    libffi8 \
    tzdata \
    libgeos-dev \
    libproj-dev \
    libgdal-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /run/postgresql /var/lib/postgresql/data \
    && chown -R postgres:postgres /run/postgresql /var/lib/postgresql

# Copy Ruby runtime and application from Dawarich image
COPY --from=freikin/dawarich:latest /usr/local/bin/ /usr/local/bin/
COPY --from=freikin/dawarich:latest /usr/local/lib/ /usr/local/lib/
COPY --from=freikin/dawarich:latest /usr/local/bundle /usr/local/bundle
COPY --from=freikin/dawarich:latest /var/app /var/app

# Set Ruby/Bundler environment (these ENV vars don't carry over from COPY --from)
ENV GEM_HOME=/usr/local/bundle \
    BUNDLE_PATH=/usr/local/bundle/gems \
    BUNDLE_APP_CONFIG=/usr/local/bundle \
    BUNDLE_SILENCE_ROOT_WARNING=1 \
    RUBY_YJIT_ENABLE=1 \
    PATH=/usr/local/bundle/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Ensure shared libraries are found
RUN ldconfig

WORKDIR /var/app

# Allow all hosts — addon runs behind HA auth, and ingress uses dynamic internal hostnames
RUN echo 'Rails.application.config.hosts.clear' > /var/app/config/initializers/allow_all_hosts.rb

COPY run.sh /
COPY ha_bridge.py /
RUN chmod a+x /run.sh /ha_bridge.py

CMD [ "/run.sh" ]
