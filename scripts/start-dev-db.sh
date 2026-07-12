#!/bin/sh

set -eu

if [ "${APP_ENV:-}" = "remote-dev" ] || [ "${DEV_PROFILE:-}" = "remote-dev" ]; then
  echo "Skipping local PostgreSQL; remote-dev profile is active."
  exit 0
fi

if [ "${APP_ENV:-}" = "production" ] || [ "${DEV_PROFILE:-}" = "prod" ]; then
  echo "Skipping local PostgreSQL; production profile is active."
  exit 0
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
SERVICE_NAME="${DB_SERVICE:-postgres}"
DB_HOST_PORT="${DB_HOST_PORT:-55436}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-ewatrade}"
MAX_ATTEMPTS="${DB_WAIT_ATTEMPTS:-30}"
SLEEP_SECONDS="${DB_WAIT_SECONDS:-1}"
DOCKER_MAX_ATTEMPTS="${DOCKER_WAIT_ATTEMPTS:-60}"
DOCKER_SLEEP_SECONDS="${DOCKER_WAIT_SECONDS:-2}"

print_port_diagnostics() {
  if command -v lsof >/dev/null 2>&1; then
    echo "Port $DB_HOST_PORT listeners:" >&2
    lsof -nP -iTCP:"$DB_HOST_PORT" -sTCP:LISTEN >&2 || true
  fi
  if command -v docker >/dev/null 2>&1; then
    echo "Docker containers publishing $DB_HOST_PORT:" >&2
    docker ps --filter publish="$DB_HOST_PORT" --format '  {{.Names}}	{{.Image}}	{{.Ports}}' >&2 || true
  fi
}

get_published_db_ports() {
  container_id="$1"
  docker inspect "$container_id" --format '{{with index .NetworkSettings.Ports "5432/tcp"}}{{range .}}{{println .HostPort}}{{end}}{{end}}' 2>/dev/null || true
}

host_port_has_listener() {
  command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$DB_HOST_PORT" -sTCP:LISTEN >/dev/null 2>&1
}

ensure_host_port_published() {
  container_id="$1"

  if get_published_db_ports "$container_id" | grep -qx "$DB_HOST_PORT"; then
    return 0
  fi

  cat >&2 <<EOF
Local PostgreSQL is running, but it is not published on localhost:$DB_HOST_PORT.

Your local DATABASE_URL uses localhost:$DB_HOST_PORT, so the app would connect to whichever process owns that port instead of this container.
EOF
  print_port_diagnostics
  return 1
}

recreate_service() {
  echo "Recreating local PostgreSQL container to restore localhost:$DB_HOST_PORT publishing..."
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$SERVICE_NAME"
}

wait_for_postgres() {
  attempt=1
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    if docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      echo "Local PostgreSQL is ready."
      return 0
    fi

    echo "Waiting for local PostgreSQL... ($attempt/$MAX_ATTEMPTS)"
    attempt=$((attempt + 1))
    sleep "$SLEEP_SECONDS"
  done

  return 1
}

wait_for_docker() {
  attempt=1
  while [ "$attempt" -le "$DOCKER_MAX_ATTEMPTS" ]; do
    if docker info >/dev/null 2>&1; then
      return 0
    fi

    echo "Waiting for Docker Engine... ($attempt/$DOCKER_MAX_ATTEMPTS)"
    attempt=$((attempt + 1))
    sleep "$DOCKER_SLEEP_SECONDS"
  done

  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Docker is not installed or is not available on PATH.

Install Docker Desktop or a Docker-compatible CLI and daemon, then rerun the command.
EOF
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Docker Compose is not available.

Install the Docker Compose plugin, then rerun the command.
EOF
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if [ "$(uname -s)" = "Darwin" ] && command -v open >/dev/null 2>&1; then
    echo "Docker Engine is not reachable. Opening Docker Desktop..."
    open -gj -a Docker || true

    if wait_for_docker; then
      echo "Docker Engine is ready."
    else
      cat >&2 <<'EOF'
Docker Desktop was opened, but Docker Engine did not become reachable in time.

Check that Docker Desktop finished starting, then rerun your command.

Useful checks:
  docker context ls
  docker context use desktop-linux
EOF
      exit 1
    fi
  else
    cat >&2 <<'EOF'
Docker Engine is not reachable.

Start Docker Desktop or another Docker-compatible daemon, then rerun your command.

If Docker is already running, check the active context:
  docker context ls
EOF
    exit 1
  fi
fi

running_container_id=$(docker compose -f "$COMPOSE_FILE" ps --status running -q "$SERVICE_NAME" 2>/dev/null || true)
if [ -n "$running_container_id" ]; then
  echo "Local PostgreSQL container is already running."
  if ! ensure_host_port_published "$running_container_id"; then
    if host_port_has_listener; then
      exit 1
    fi

    if ! recreate_service; then
      print_port_diagnostics
      exit 1
    fi

    running_container_id=$(docker compose -f "$COMPOSE_FILE" ps --status running -q "$SERVICE_NAME" 2>/dev/null || true)
    if [ -z "$running_container_id" ] || ! ensure_host_port_published "$running_container_id"; then
      exit 1
    fi
  fi
  if wait_for_postgres; then
    exit 0
  fi

  echo "Local PostgreSQL is running but did not become ready in time." >&2
  echo "Try: docker compose -f \"$COMPOSE_FILE\" logs \"$SERVICE_NAME\"" >&2
  exit 1
fi

echo "Starting local PostgreSQL container..."
if ! docker compose -f "$COMPOSE_FILE" up -d "$SERVICE_NAME"; then
  cat >&2 <<EOF
Could not start the local PostgreSQL container.

Check whether host port $DB_HOST_PORT is already in use and inspect Compose output above.
Compose file: $COMPOSE_FILE
EOF
  print_port_diagnostics
  exit 1
fi

running_container_id=$(docker compose -f "$COMPOSE_FILE" ps --status running -q "$SERVICE_NAME" 2>/dev/null || true)
if [ -n "$running_container_id" ] && ! ensure_host_port_published "$running_container_id"; then
  exit 1
fi

if wait_for_postgres; then
  exit 0
fi

echo "Local PostgreSQL did not become ready in time." >&2
echo "Try: docker compose -f \"$COMPOSE_FILE\" logs \"$SERVICE_NAME\"" >&2
exit 1
