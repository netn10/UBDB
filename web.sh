#!/usr/bin/env bash
# One Heroku web dyno, two tiers:
#   - Flask API via gunicorn, bound to an internal loopback port
#   - Next.js server on Heroku's $PORT, proxying /api/* to the Flask API
# If either process exits, tear the other down so Heroku restarts the dyno.
set -euo pipefail

gunicorn --chdir backend --bind 127.0.0.1:5000 --workers 2 app:app &
api_pid=$!

npm run start -- -p "${PORT:-3000}" -H 0.0.0.0 &
web_pid=$!

wait -n
kill "$api_pid" "$web_pid" 2>/dev/null || true
exit 1
