FROM php:8.1-fpm

ARG user=www-data

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    libzip-dev \
    libmagickwand-dev \
    mariadb-client \
    nginx \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN pecl install imagick \
    && docker-php-ext-enable imagick \
    && docker-php-ext-install pdo_mysql mbstring zip exif pcntl bcmath gd

# Get latest Composer
COPY --from=composer:2.6.6 /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www

RUN rm -rf * \
    && git clone https://github.com/crater-invoice/crater.git . \
    && git checkout 05d5ce2 \
    && rm -rf .git \
    && cp .env.example .env \
    && sed -i -e 's/^DB_CONNECTION=mysql/DB_CONNECTION=sqlite/' \
    -e '/^DB_HOST=/d' \
    -e '/^DB_PORT=/d' \
    -e '/^DB_DATABASE=/d' \
    -e '/^DB_USERNAME=/d' \
    -e '/^DB_PASSWORD=/d' .env

COPY ./php/uploads.ini /usr/local/etc/php/conf.d/uploads.ini
COPY ./nginx /etc/nginx/conf.d/
COPY ./run.sh .

RUN rm /etc/nginx/sites-enabled/default

RUN composer install --no-interaction --prefer-dist --optimize-autoloader && \
    php artisan storage:link || true && \
    php artisan key:generate

RUN chown -R $user:$user . \
    && chmod 775 -R storage/framework/ \
    && chmod 775 -R storage/logs/ \
    && chmod 775 -R bootstrap/cache/

CMD [ "bash", "/var/www/run.sh" ]