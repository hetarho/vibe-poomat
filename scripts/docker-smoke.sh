#!/usr/bin/env bash
# Builds both images, brings the stack up, checks the endpoints a deploy depends
# on, then tears everything down. Not part of `turbo run test`: too slow for the
# inner loop, and it is the pre-deploy check instead. The deploy workflow runs
# the very same checks against the public domain with SMOKE_REMOTE=1.
set -euo pipefail

cd "$(dirname "$0")/.."

API_URL=${SMOKE_API_URL:-http://127.0.0.1:3001}
WEB_URL=${SMOKE_WEB_URL:-http://127.0.0.1:3000}
# SMOKE_REMOTE=1 points the same checks at an already-running target (the
# deployed domain, from .github/workflows/deploy.yml): nothing is built here and
# nothing is torn down afterwards, so "is it up" has exactly one implementation.
REMOTE=${SMOKE_REMOTE:-0}
SKIP_BUILD=${SMOKE_SKIP_BUILD:-$REMOTE}
SKIP_STACK=${SMOKE_SKIP_STACK:-$REMOTE}

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

teardown() {
  if [ "$SKIP_STACK" = "0" ]; then
    log 'tearing the stack down'
    docker compose down --remove-orphans --volumes >/dev/null 2>&1 || true
  fi
}
trap teardown EXIT

# Polls until the endpoint answers with the expected status, or gives up.
expect_status() {
  local url=$1 expected=$2 attempts=${3:-60} method=${4:-GET} status=''
  for _ in $(seq 1 "$attempts"); do
    status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X "$method" "$url" || true)
    [ "$status" = "$expected" ] && { echo "  ok   $url -> $status"; return 0; }
    sleep 2
  done
  echo "  FAIL $url -> ${status:-no response} (wanted $expected)" >&2
  return 1
}

expect_body() {
  local url=$1 needle=$2
  if curl -s --max-time 10 "$url" | grep -q -- "$needle"; then
    echo "  ok   $url contains '$needle'"
  else
    echo "  FAIL $url does not contain '$needle'" >&2
    return 1
  fi
}

expect_body_of_post() {
  local url=$1 needle=$2 body=''
  body=$(curl -s --max-time 10 -X POST "$url" -H 'content-type: application/json' -d '{}')
  if printf '%s' "$body" | grep -q -- "$needle"; then
    echo "  ok   POST $url contains '$needle'"
  else
    echo "  FAIL POST $url does not contain '$needle': $body" >&2
    return 1
  fi
}

if [ "$SKIP_BUILD" = "0" ]; then
  log 'building the api and web images'
  # migrate shares the api's image tag, so building api updates it too
  docker compose build api web
fi

if [ "$SKIP_STACK" = "0" ]; then
  log 'starting pg, running migrations, then api and web'
  docker compose up -d --wait web
fi

log 'checking the api'
expect_status "$API_URL/health" 200
expect_status "$API_URL/ready" 200
expect_body "$API_URL/health" '"status":"ok"'
expect_body "$API_URL/ready" '"db":true'
expect_body "$API_URL/ready" '"jobs":true'

log 'checking that the session guard is live'
# every route is authenticated unless it says otherwise, so an anonymous write
# must be refused. There is no way to sign in from here without a real OAuth
# provider, which is why signing an upload is proven by the integration tests
# and this only proves the route exists and the guard is in front of it.
expect_status "$API_URL/api/v1/uploads" 401 1 POST
expect_body_of_post "$API_URL/api/v1/uploads" '"code":"UNAUTHENTICATED"'

log 'checking the web app'
expect_status "$WEB_URL/" 200
expect_body "$WEB_URL/" '<footer'
expect_body "$WEB_URL/" 'Trade real feedback'

log 'docker smoke passed'
