#!/usr/bin/with-contenv bashio

# /var/www/storage/app/database_created is created once setup is finished
# but more generally, we have to keep /var/www/storage/ persistent
# we put it in /data/crater/storage


ISCREATED_FILE="/data/crater/storage/app/database_created"

# Check if the file exists
if [ -f "$ISCREATED_FILE" ]; then
    echo "Database already exists, using exsiting one"
    rm -rf /var/www/storage
    rm -rf /var/www/bootstrap/cache
    rm -rf /var/www/.env

    ln -s /data/crater/storage /var/www/storage
    ln -s /data/crater/bootstrap/cache /var/www/bootstrap/cache
    ln -s /data/crater/database.sqlite /var/www/database/database.sqlite
    ln -s /data/crater/.env /var/www/.env
else
    echo "Database does not already exists, creating an empty one"

    mkdir -p /data/crater/

    cp -r /var/www/storage /data/crater
    chmod 777 -R /data/crater
    rm -rf /var/www/storage
    ln -s /data/crater/storage /var/www/storage

    cp -r /var/www/bootstrap /data/crater
    chmod 777 -R /data/crater
    rm -rf /var/www/bootstrap/cache
    ln -s /data/crater/bootstrap/cache /var/www/bootstrap/cache

    cp /var/www/.env /data/crater
    chmod 777 -R /data/crater
    rm -rf /var/www/.env
    ln -s /data/crater/.env /var/www/.env

    touch /data/crater/database.sqlite
    chmod 777 /data/crater/database.sqlite
    ln -s /data/crater/database.sqlite /var/www/database/database.sqlite
fi

id
nginx
php-fpm