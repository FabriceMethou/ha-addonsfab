#!/bin/bash

# https://www.openproject.org/docs/installation-and-operations/installation/docker/#using-this-container-in-production
# We need to make theses persistent :
# /var/openproject/pgdata
# /var/openproject/assets
# Or more generally, we need to make /var/openproject persistent
# Since the parent image we use already declare them as VOLUME in Dockerfile,
# we cant remove the directory (or unmont) and then make symbolic link
# however, theses path can be change as env var, so we set the env var in /data

#
# For debugging purposes only :
#
# cp /data/logs.log /data/logs.log.1
# echo "titi" > /data/logs.log
# chmod 777 /data/logs.log
# exec > /data/logs.log 2>&1

# Get config values
CONFIG_PATH=/data/options.json

# use -r otherwise it gives quotes and string is invalid !
app_hostname="$(jq -r '.app_hostname' $CONFIG_PATH)"
secret="$(jq -r '.secret' $CONFIG_PATH)"
ssl="$(jq -r '.ssl' $CONFIG_PATH)"

echo "app_hostname=$app_hostname"
echo "secret=$secret"
echo "ssl=$ssl"

export OPENPROJECT_HOST__NAME="$app_hostname"
export OPENPROJECT_SECRET_KEY_BASE="$secret"
export OPENPROJECT_HTTPS="$ssl"

# Original : APP_DATA_PATH=/var/openproject/assets
export APP_DATA_PATH="/data/openproject/assets"
# Original : PGDATA=/var/openproject/pgdata
export PGDATA="/data/openproject/pgdata"

mkdir -p $APP_DATA_PATH $PGDATA

id
./docker/prod/entrypoint.sh ./docker/prod/supervisord