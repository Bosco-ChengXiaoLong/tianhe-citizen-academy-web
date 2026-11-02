#!/bin/sh
# Run from a full checkout on the target Docker-capable Jenkins agent/server.
set -eu
ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
APP=${1:-}
case "$APP" in admin|h5) ;; *) echo 'usage: sh deploy/release.sh admin|h5' >&2; exit 2 ;; esac
case "${BUILD_NUMBER:-}" in ''|*[!0-9]*) echo 'Set a numeric BUILD_NUMBER (manual example: BUILD_NUMBER=1)' >&2; exit 2 ;; esac
DEPLOY=${DEPLOY:-true}
RUN_BROWSER_TESTS=${RUN_BROWSER_TESTS:-true}
case "$DEPLOY:$RUN_BROWSER_TESTS" in true:true|true:false|false:true|false:false) ;; *) echo 'DEPLOY/RUN_BROWSER_TESTS must be true or false' >&2; exit 2 ;; esac
APP_DIR="$ROOT"
CONTAINER="qingmu-academy-$APP"
PROJECT="$CONTAINER"
export TZ=Asia/Shanghai
export SERVICE_NETWORK=${SERVICE_NETWORK:-qingmu-academy-internal}
export JAVA_UPSTREAM=${JAVA_UPSTREAM:-qingmu-java:8080}
export VITE_DATA_SOURCE=${VITE_DATA_SOURCE:-api}
case "$VITE_DATA_SOURCE" in mock|demo|api) ;; *) echo 'VITE_DATA_SOURCE must be mock or api' >&2; exit 2 ;; esac
if [ "$APP" = admin ]; then export VITE_API_BASE_URL=/api/admin/v1; else export VITE_API_BASE_URL=/api; fi
STEP=initialization
UPDATING=0
PREVIOUS_IMAGE=''
LOCK=''
log() { printf '[%s] [%s/%s] %s\n' "$(date '+%F %T %z')" "$APP" "$STEP" "$*"; }
compose() { docker compose --project-name "$PROJECT" -f "$APP_DIR/compose.yml" "$@"; }
diagnostics() {
    docker ps -a --filter "name=^/$CONTAINER$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
    docker logs --tail 40 "$CONTAINER" || true
}
finish() {
    result=$?
    trap - 0
    if [ "$result" -ne 0 ]; then
        log "failed at $STEP (exit $result)"
        if [ "$UPDATING" -eq 1 ]; then
            diagnostics
            if [ -n "$PREVIOUS_IMAGE" ]; then
                log "restore immutable previous image $PREVIOUS_IMAGE"
                if FRONTEND_IMAGE="$PREVIOUS_IMAGE" compose up -d --wait --wait-timeout 90; then
                    log 'previous image restored; this release remains FAILED'
                else log 'ROLLBACK FAILED; inspect this application container'; diagnostics; fi
            else log 'first release: no previous image; preserve failed container for inspection'; fi
        fi
    fi
    if [ -n "$LOCK" ]; then rmdir "$LOCK" 2>/dev/null || true; fi
    exit "$result"
}
trap finish 0
trap 'exit 130' INT
trap 'exit 143' TERM

STEP=preflight
cd "$APP_DIR"
for file in package-lock.json Dockerfile compose.yml deploy/nginx/nginx.conf deploy/nginx/default.conf.template; do
    test -s "$file" || { log "missing $file"; exit 1; }
done
for tool in node npm; do command -v "$tool" >/dev/null 2>&1 || { log "missing $tool"; exit 1; }; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<12))process.exit(1)'
node --version
npm --version
COMMIT=$(git -C "$ROOT" rev-parse --short=12 HEAD 2>/dev/null || printf local)
export FRONTEND_IMAGE="qingmu-academy-$APP:b${BUILD_NUMBER}-$COMMIT"
log "image=$FRONTEND_IMAGE mode=$VITE_DATA_SOURCE deploy=$DEPLOY"

# Shared host lock also protects against another Jenkins job deploying this same app.
LOCK_ROOT=${RELEASE_LOCK_ROOT:-/tmp/qingmu-academy-release}
mkdir -p "$LOCK_ROOT"
if mkdir "$LOCK_ROOT/$APP.lock" 2>/dev/null; then LOCK="$LOCK_ROOT/$APP.lock";
else log 'another release holds the app lock; refusing concurrent update'; exit 1; fi

if [ "$DEPLOY" = true ]; then
    command -v docker >/dev/null 2>&1 || { log 'Docker CLI is required to deploy'; exit 1; }
    docker version >/dev/null
    docker compose version
    sh "$APP_DIR/deploy/nginx/19-validate-env.sh"
    if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
        owner=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$CONTAINER")
        service=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$CONTAINER")
        [ "$owner" = "$PROJECT" ] && [ "$service" = "$APP" ] || { log 'existing container belongs to another owner; refusing takeover'; exit 1; }
        PREVIOUS_IMAGE=$(docker inspect --format '{{.Image}}' "$CONTAINER")
    fi
fi

STEP=install
npm ci --no-audit --no-fund
STEP=checks
npm run check
if [ "$RUN_BROWSER_TESTS" = true ]; then
    STEP=browser
    if [ "$(node -p 'process.platform')" != win32 ]; then npx playwright install chromium; fi
    if [ "$APP" = admin ]; then npm run verify:ui; else npm run test:e2e; fi
else log 'browser regression explicitly skipped'; fi
test -s dist/index.html
if [ "$DEPLOY" = false ]; then log 'checks/build finished; no Docker deployment requested'; exit 0; fi

STEP=image
docker build --pull --progress=plain --build-arg "NGINX_IMAGE=${NGINX_IMAGE:-nginx:1.30-alpine}" -t "$FRONTEND_IMAGE" -f Dockerfile .
# Normal entrypoint performs env validation and template expansion, then nginx -t.
docker run --rm -e "JAVA_UPSTREAM=$JAVA_UPSTREAM" "$FRONTEND_IMAGE" nginx -t
STEP=network
if ! docker network inspect "$SERVICE_NETWORK" >/dev/null 2>&1; then
    docker network create "$SERVICE_NETWORK" >/dev/null || docker network inspect "$SERVICE_NETWORK" >/dev/null
fi
compose config --quiet
STEP=update
UPDATING=1
compose up -d --wait --wait-timeout 90
docker exec "$CONTAINER" sh -c 'wget -q -O /dev/null http://127.0.0.1:8080/healthz && wget -q -O /dev/null http://127.0.0.1:8080/'
STEP=finished
compose ps
log "release succeeded: $FRONTEND_IMAGE"
log 'Java service readiness is independent of frontend health; verify real API readiness independently.'
UPDATING=0
