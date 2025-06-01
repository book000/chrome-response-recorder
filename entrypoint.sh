#!/bin/bash
set -e

rm -f /userdata/Singleton*

: ${VNC_SCREEN_SIZE:='1024x768'}
IFS='x' read SCREEN_WIDTH SCREEN_HEIGHT <<< "${VNC_SCREEN_SIZE}"
export VNC_SCREEN="${SCREEN_WIDTH}x${SCREEN_HEIGHT}x16"

exec "$@"
