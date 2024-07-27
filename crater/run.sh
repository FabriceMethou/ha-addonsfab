#!/usr/bin/with-contenv bashio
touch /data/database.sqlite
chown $user:$user /data/database.sqlite
chmod 775 /data/database.sqlite
id
nginx
php-fpm