#!/usr/bin/env bash
# Safe, local-only Phase 3 supervisor. It intentionally never removes database data.
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
SCRIPT_NAME=$(basename -- "$0")

STATE_DIR="$REPO_ROOT/.local-run"
LEASE_DIR="$STATE_DIR/leases"
RUN_LOCK="$STATE_DIR/run.lock"
RECOVERY_LOCK="$STATE_DIR/run.lock.recovery"
STATE_MARKER="$STATE_DIR/managed-by-local-dev-v1"
SUPERVISOR_PID_FILE="$STATE_DIR/supervisor.pid"
BACKEND_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"
BACKEND_LOG="$STATE_DIR/backend.log"
FRONTEND_LOG="$STATE_DIR/frontend.log"
NPM_LOCK_HASH_FILE="$STATE_DIR/npm-lock.sha256"
OWNER_MARKER="$STATE_DIR/local-owner-created-v1"
MEDIA_DIR="$STATE_DIR/media"

COMPOSE_FILE="$REPO_ROOT/compose.yaml"
FRONTEND_DIR="$REPO_ROOT/src/frontend"
BACKEND_DIR="$REPO_ROOT/src/backend/OmniRest.Api"
BACKEND_SOLUTION="$REPO_ROOT/src/backend/OmniRest.sln"
BACKEND_PROJECT="$BACKEND_DIR/OmniRest.Api.csproj"
BACKEND_DLL="$BACKEND_DIR/bin/Debug/net10.0/OmniRest.Api.dll"
NEXT_BIN="$FRONTEND_DIR/node_modules/next/dist/bin/next"
NEXT_PROCESS_TITLE="next-server"

OWNER_EMAIL="owner@menu.localhost"
OWNER_RESTAURANT_ID="85df1654-099a-58e1-ac09-38599f51a1d7"
OWNER_DISPLAY_NAME="Local Restaurant Owner"
POSTGRES_STARTED=0
CLEANUP_RUNNING=0
LOCK_HELD=0
RUN_TOKEN="${OMNIREST_LOCAL_RUN_TOKEN:-}"

die() {
  printf 'local-dev: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: scripts/local-dev.sh [run|status|logs [-f]|stop]

  run     Start the local Phase 3 stack in the foreground (default).
  status  Report supervisor, process, Compose, and HTTP state.
  logs    Show both application logs; add -f to follow them.
  stop    Safely stop this supervisor and its app processes, then PostgreSQL.
EOF
}

generate_run_token() {
  od -An -N32 -tx1 /dev/urandom | tr -d '[:space:]'
}

ensure_supervisor_identity() {
  if [ "${#RUN_TOKEN}" -ne 64 ] || [ -n "${RUN_TOKEN//[0-9a-f]/}" ]; then
    local token
    token=$(generate_run_token)
    [ "${#token}" -eq 64 ] || die "Could not create a local-run ownership token."
    exec env OMNIREST_LOCAL_RUN_TOKEN="$token" OMNIREST_LOCAL_RUN_ROLE=supervisor "$SCRIPT_DIR/local-dev.sh" run
  fi
  [ "${OMNIREST_LOCAL_RUN_ROLE:-}" = supervisor ] || die "Invalid local supervisor identity. Start a new run without OMNIREST_LOCAL_RUN_* variables."
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command '$1'. Install it, then rerun this script."
}

required_file() {
  [ -f "$1" ] || die "Required file is missing: ${1#"$REPO_ROOT"/}. Restore the repository checkout, then rerun."
}

compose() {
  (cd "$REPO_ROOT" && docker compose -f "$COMPOSE_FILE" "$@")
}

process_start() {
  ps -p "$1" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

record_pid() {
  local pid="$1"
  local record="$2"
  local role="$3"
  local started
  started=$(process_start "$pid")
  [ -n "$RUN_TOKEN" ] && [ -n "$started" ] || die "Could not record process $pid safely."
  (umask 077; printf '%s|%s|%s|%s\n' "$pid" "$started" "$RUN_TOKEN" "$role" > "$record")
  chmod 600 "$record"
}

recorded_pid() {
  local record="$1"
  [ -f "$record" ] || return 1
  IFS='|' read -r RECORDED_PID RECORDED_START RECORDED_TOKEN RECORDED_ROLE < "$record" || return 1
  case "$RECORDED_PID" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ -n "${RECORDED_START:-}" ] && [ -n "${RECORDED_TOKEN:-}" ] && [ -n "${RECORDED_ROLE:-}" ] || return 1
  return 0
}

lease_path() { printf '%s/%s.%s\n' "$LEASE_DIR" "$1" "$2"; }

create_lease() {
  local role="$1" lease
  lease=$(lease_path "$RUN_TOKEN" "$role")
  mkdir -p "$LEASE_DIR"
  chmod 700 "$LEASE_DIR"
  (umask 077; printf 'token=%s\nrole=%s\n' "$RUN_TOKEN" "$role" > "$lease")
  chmod 600 "$lease"
}

process_environment_matches() {
  local pid="$1" token="$2" role="$3" environment
  [ -r "/proc/$pid/environ" ] || return 0
  environment=$(tr '\000' '\n' < "/proc/$pid/environ" 2>/dev/null || true)
  printf '%s\n' "$environment" | grep -Fqx "OMNIREST_LOCAL_RUN_TOKEN=$token" &&
    printf '%s\n' "$environment" | grep -Fqx "OMNIREST_LOCAL_RUN_ROLE=$role"
}

process_lease_matches() {
  local pid="$1" token="$2" role="$3" lease
  lease=$(lease_path "$token" "$role")
  if [ -d "/proc/$pid/fd" ]; then
    command -v readlink >/dev/null 2>&1 || return 1
    [ "$(readlink "/proc/$pid/fd/9" 2>/dev/null || true)" = "$lease" ]
    return
  fi
  lsof -a -p "$pid" -d 9 -Fn 2>/dev/null | sed -n 's/^n//p' | grep -Fqx "$lease"
}

pid_record_matches() {
  local record="$1"
  local role="$2"
  local current_start
  recorded_pid "$record" || return 1
  [ "$RECORDED_ROLE" = "$role" ] || return 1
  current_start=$(process_start "$RECORDED_PID")
  [ -n "$current_start" ] && [ "$current_start" = "$RECORDED_START" ] || return 1
  process_environment_matches "$RECORDED_PID" "$RECORDED_TOKEN" "$RECORDED_ROLE" &&
    process_lease_matches "$RECORDED_PID" "$RECORDED_TOKEN" "$RECORDED_ROLE"
}

supervisor_record_matches() {
  pid_record_matches "$SUPERVISOR_PID_FILE" supervisor
}

backend_is_owned() { pid_record_matches "$BACKEND_PID_FILE" backend; }
frontend_is_owned() { pid_record_matches "$FRONTEND_PID_FILE" frontend; }

lock_record_matches() {
  local lock="$1" role="$2"
  pid_record_matches "$lock" "$role"
}

write_lock_candidate() {
  local candidate="$1" role="$2" started
  started=$(process_start "$$")
  [ -n "$started" ] || die "Could not establish local-run lock identity."
  (umask 077; printf '%s|%s|%s|%s\n' "$$" "$started" "$RUN_TOKEN" "$role" > "$candidate")
  chmod 600 "$candidate"
}

remove_lock_if_owned() {
  local lock="$1" role="$2"
  if [ -f "$lock" ] && recorded_pid "$lock" && [ "$RECORDED_PID" = "$$" ] &&
    [ "$RECORDED_TOKEN" = "$RUN_TOKEN" ] && [ "$RECORDED_ROLE" = "$role" ]; then
    rm -f "$lock"
  fi
}

remove_record_if_owned() {
  local record="$1" role="$2"
  if [ -f "$record" ] && recorded_pid "$record" && [ "$RECORDED_TOKEN" = "$RUN_TOKEN" ] && [ "$RECORDED_ROLE" = "$role" ]; then
    rm -f "$record"
  fi
}

remove_lease_if_owned() {
  local role="$1" lease expected actual
  lease=$(lease_path "$RUN_TOKEN" "$role")
  expected=$(printf 'token=%s\nrole=%s' "$RUN_TOKEN" "$role")
  [ -f "$lease" ] || return 0
  actual=$(cat "$lease" 2>/dev/null || true)
  [ "$actual" = "$expected" ] && rm -f "$lease"
}

prepare_supervisor_lease() {
  mkdir -p "$STATE_DIR" "$LEASE_DIR"
  chmod 700 "$STATE_DIR" "$LEASE_DIR"
  create_lease supervisor
  exec 9< "$(lease_path "$RUN_TOKEN" supervisor)"
}

acquire_recovery_lock() {
  local candidate="$STATE_DIR/.recovery.$RUN_TOKEN" stale
  # A recovery operation is owned by this already-identified supervisor, so
  # validate it through that supervisor's role and lease rather than a second
  # transient role/lease.
  write_lock_candidate "$candidate" supervisor
  if ln "$candidate" "$RECOVERY_LOCK" 2>/dev/null; then
    rm -f "$candidate"
    return 0
  fi
  rm -f "$candidate"

  # A recovery lock is also a supervisor record.  If it cannot be validated,
  # atomically move that complete, prewritten record out of the contested name.
  # We never unlink the contested pathname after the move: another contender
  # may publish its own hard-link as soon as it becomes free.
  if ! lock_record_matches "$RECOVERY_LOCK" supervisor; then
    stale="$RECOVERY_LOCK.stale.$RUN_TOKEN"
    mv "$RECOVERY_LOCK" "$stale" 2>/dev/null || true
  fi
  return 1
}

acquire_run_lock() {
  local candidate="$STATE_DIR/.run.$RUN_TOKEN" attempt=0
  write_lock_candidate "$candidate" supervisor
  while [ "$attempt" -lt 20 ]; do
    if ln "$candidate" "$RUN_LOCK" 2>/dev/null; then
      rm -f "$candidate"
      LOCK_HELD=1
      return 0
    fi
    if lock_record_matches "$RUN_LOCK" supervisor; then
      rm -f "$candidate"
      die "Another validated Omni REST supervisor owns this checkout. Use '$SCRIPT_NAME status' or '$SCRIPT_NAME stop'."
    fi
    if acquire_recovery_lock; then
      if ! lock_record_matches "$RUN_LOCK" supervisor; then
        rm -f "$RUN_LOCK"
      fi
      remove_lock_if_owned "$RECOVERY_LOCK" supervisor
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  rm -f "$candidate"
  die "Local-run lock is busy or malformed; wait for its owner or inspect .local-run without deleting data."
}

listener_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
  else
    ss -ltnp "sport = :$1" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u
  fi
}

port_has_listener() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    ss -ltn "sport = :$1" 2>/dev/null | awk 'NR > 1 { found = 1 } END { exit !found }'
  fi
}

postgres_service_is_running() {
  [ -n "$(compose ps --status running -q postgres 2>/dev/null || true)" ]
}

port_is_owned() {
  local port="$1"
  local listener
  local allowed_pid=""
  local saw_listener=0
  case "$port" in
    5279)
      backend_is_owned && allowed_pid="$RECORDED_PID"
      ;;
    3000)
      frontend_is_owned && allowed_pid="$RECORDED_PID"
      ;;
    55432)
      postgres_service_is_running && return 0
      ;;
  esac

  [ -n "$allowed_pid" ] || return 1
  for listener in $(listener_pids "$port"); do
    saw_listener=1
    [ "$listener" = "$allowed_pid" ] || return 1
  done
  [ "$saw_listener" -eq 1 ]
}

assert_port_available() {
  local port="$1"
  port_has_listener "$port" || return 0
  port_is_owned "$port" && return 0
  die "Port $port is already listening and is not owned by this stack. Stop the conflicting service (or use another checkout), then rerun."
}

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    die "Missing shasum or sha256sum, required to safely detect frontend lockfile changes."
  fi
}

backend_environment() {
  export ASPNETCORE_ENVIRONMENT=Development
  export ReverseProxy__KnownProxies__0=127.0.0.1
  export MediaStorage__LocalRoot="$MEDIA_DIR"
}

preflight() {
  required_file "$COMPOSE_FILE"
  required_file "$REPO_ROOT/global.json"
  required_file "$REPO_ROOT/.node-version"
  required_file "$FRONTEND_DIR/package.json"
  required_file "$FRONTEND_DIR/package-lock.json"
  required_file "$BACKEND_SOLUTION"
  required_file "$BACKEND_PROJECT"
  required_file "$REPO_ROOT/.config/dotnet-tools.json"

  require_command docker
  require_command node
  require_command npm
  require_command dotnet
  require_command curl
  if [ -d /proc ]; then
    require_command readlink
  else
    require_command lsof
  fi
  if ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
    die "Missing a port inspector (lsof or ss). Install one, then rerun this script."
  fi

  docker info >/dev/null 2>&1 || die "Docker Engine is unavailable. Start Docker Desktop/Engine and verify 'docker info' succeeds."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is unavailable. Install or enable the Docker Compose plugin."

  local expected_node expected_npm expected_dotnet actual_node actual_npm actual_dotnet
  expected_node=$(tr -d '[:space:]' < "$REPO_ROOT/.node-version")
  expected_npm=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"npm@\([^"]*\)".*/\1/p' "$FRONTEND_DIR/package.json" | head -n 1)
  expected_dotnet=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$REPO_ROOT/global.json" | head -n 1)
  actual_node=$(node --version | sed 's/^v//')
  actual_npm=$(npm --version)
  actual_dotnet=$(dotnet --version)
  [ -n "$expected_node" ] && [ "$actual_node" = "$expected_node" ] || die "Node.js $expected_node is required; found $actual_node. Activate the pinned Node version, then rerun."
  [ -n "$expected_npm" ] && [ "$actual_npm" = "$expected_npm" ] || die "npm $expected_npm is required; found $actual_npm. Activate the pinned npm version, then rerun."
  [ -n "$expected_dotnet" ] && [ "$actual_dotnet" = "$expected_dotnet" ] || die ".NET SDK $expected_dotnet is required; found $actual_dotnet. Install/select the pinned SDK, then rerun."

  assert_port_available 3000
  assert_port_available 5279
  assert_port_available 55432

  if backend_is_owned || frontend_is_owned || supervisor_record_matches; then
    die "An Omni REST local run is already recorded. Use '$SCRIPT_NAME status' or '$SCRIPT_NAME stop' before starting another supervisor."
  fi
}

tail_logs() {
  printf '\n--- backend log (%s) ---\n' "$BACKEND_LOG" >&2
  tail -n 80 "$BACKEND_LOG" 2>/dev/null >&2 || true
  printf '\n--- frontend log (%s) ---\n' "$FRONTEND_LOG" >&2
  tail -n 80 "$FRONTEND_LOG" 2>/dev/null >&2 || true
}

wait_for_owned_process() {
  local record="$1"
  local expected="$2"
  local label="$3"
  local attempt=0
  while [ "$attempt" -lt 20 ]; do
    pid_record_matches "$record" "$expected" && return 0
    sleep 1
    attempt=$((attempt + 1))
  done
  tail_logs
  die "$label did not start as the expected process."
}

wait_for_backend() {
  local attempt=0
  while [ "$attempt" -lt 90 ]; do
    backend_is_owned || { tail_logs; die "Backend exited before becoming ready."; }
    if curl --noproxy '*' --fail --silent --max-time 3 \
      --header 'Host: menu.localhost' \
      http://127.0.0.1:5279/api/v1/public/restaurant >/dev/null; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  tail_logs
  die "Timed out waiting for backend readiness at /api/v1/public/restaurant."
}

wait_for_frontend() {
  local attempt=0
  while [ "$attempt" -lt 90 ]; do
    frontend_is_owned || { tail_logs; die "Frontend exited before becoming ready."; }
    if curl --noproxy '*' --fail --silent --max-time 5 \
      --resolve menu.localhost:3000:127.0.0.1 \
      http://menu.localhost:3000/ >/dev/null; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  tail_logs
  die "Timed out waiting for frontend readiness at menu.localhost:3000."
}

terminate_valid_pid() {
  local record="$1"
  local expected="$2"
  local label="$3"
  local attempt=0
  if pid_record_matches "$record" "$expected"; then
    printf 'Stopping %s (pid %s).\n' "$label" "$RECORDED_PID"
    kill -TERM "$RECORDED_PID" 2>/dev/null || true
    while [ "$attempt" -lt 20 ]; do
      pid_record_matches "$record" "$expected" || break
      sleep 1
      attempt=$((attempt + 1))
    done
    pid_record_matches "$record" "$expected" && die "$label did not stop after SIGTERM; leaving it untouched for safety."
    return 0
  elif [ -f "$record" ]; then
    printf 'Not signalling %s: its PID record is stale or does not match the expected command.\n' "$label" >&2
  fi
  return 0
}

stop_postgres() {
  if postgres_service_is_running; then
    printf 'Stopping the Compose postgres service (the named volume is preserved).\n'
    compose stop postgres
  fi
}

cleanup() {
  [ "$CLEANUP_RUNNING" -eq 0 ] || return
  CLEANUP_RUNNING=1
  set +e
  terminate_valid_pid "$FRONTEND_PID_FILE" frontend "frontend"
  terminate_valid_pid "$BACKEND_PID_FILE" backend "backend"
  if [ "$POSTGRES_STARTED" -eq 1 ]; then
    stop_postgres
  fi
  remove_record_if_owned "$SUPERVISOR_PID_FILE" supervisor
  remove_record_if_owned "$BACKEND_PID_FILE" backend
  remove_record_if_owned "$FRONTEND_PID_FILE" frontend
  remove_lock_if_owned "$RUN_LOCK" supervisor
  remove_lock_if_owned "$RECOVERY_LOCK" supervisor
  remove_lease_if_owned backend
  remove_lease_if_owned frontend
  remove_lease_if_owned supervisor
}

trap_cleanup() {
  cleanup
  exit 0
}

install_frontend_if_needed() {
  local current_hash saved_hash=""
  current_hash=$(hash_file "$FRONTEND_DIR/package-lock.json")
  [ -f "$NPM_LOCK_HASH_FILE" ] && saved_hash=$(tr -d '[:space:]' < "$NPM_LOCK_HASH_FILE")
  if [ ! -d "$FRONTEND_DIR/node_modules" ] || [ "$saved_hash" != "$current_hash" ]; then
    printf 'Installing frontend dependencies because this is the first run or package-lock.json changed.\n'
    (cd "$FRONTEND_DIR" && npm ci) >> "$FRONTEND_LOG" 2>&1
    printf '%s\n' "$current_hash" > "$NPM_LOCK_HASH_FILE"
  fi
}

build_frontend() {
  local frontend_before frontend_after
  frontend_before=$(git -C "$REPO_ROOT" status --porcelain -- src/frontend)
  printf 'Building the production frontend.\n'
  (
    cd "$FRONTEND_DIR"
    export OMNI_REST_API_BASE_URL=http://127.0.0.1:5279
    export OMNI_REST_FORWARDED_PROTO=https
    npm run build
  ) >> "$FRONTEND_LOG" 2>&1
  frontend_after=$(git -C "$REPO_ROOT" status --porcelain -- src/frontend)
  [ "$frontend_before" = "$frontend_after" ] || die "Frontend build changed product files under src/frontend; stopping without restoring them. Inspect git status before rerunning."
}

owner_marker_is_valid() {
  local expected actual
  expected=$(printf 'email=%s\nrestaurant_id=%s\ncreated_by=local-dev.sh-v1' "$OWNER_EMAIL" "$OWNER_RESTAURANT_ID")
  [ -f "$OWNER_MARKER" ] || return 1
  actual=$(cat "$OWNER_MARKER")
  [ "$actual" = "$expected" ]
}

owner_database_state() {
  local sql
  sql="WITH owners AS (SELECT \"Id\", is_active FROM public.owner_users WHERE \"NormalizedEmail\" = upper('$OWNER_EMAIL')) SELECT CASE WHEN (SELECT count(*) FROM owners) = 0 THEN 'absent' WHEN (SELECT count(*) FROM owners) = 1 AND EXISTS (SELECT 1 FROM owners u JOIN public.restaurant_memberships m ON m.user_id = u.\"Id\" WHERE u.is_active AND m.restaurant_id = '$OWNER_RESTAURANT_ID'::uuid AND m.role = 'owner' AND m.status = 'active') THEN 'exact' ELSE 'collision' END;"
  compose exec -T postgres psql -U omni_rest -d omni_rest -Atqc "$sql"
}

write_owner_marker() {
  local temporary="$OWNER_MARKER.$RUN_TOKEN.tmp"
  (umask 077; printf 'email=%s\nrestaurant_id=%s\ncreated_by=local-dev.sh-v1\n' "$OWNER_EMAIL" "$OWNER_RESTAURANT_ID" > "$temporary")
  chmod 600 "$temporary"
  mv "$temporary" "$OWNER_MARKER"
}

provision_local_owner_if_needed() {
  local marker_valid=0 database_state
  owner_marker_is_valid && marker_valid=1
  database_state=$(owner_database_state | tr -d '[:space:]') || die "Could not validate the local owner in Compose PostgreSQL. Check postgres logs; do not reset data."
  if [ "$marker_valid" -eq 1 ] && [ "$database_state" = exact ]; then
    chmod 600 "$OWNER_MARKER"
    return 0
  fi
  if [ "$database_state" = exact ] || [ "$database_state" = collision ]; then
    die "Local owner credential collision: the marker cannot prove this script owns the existing account, or its active owner membership is not exact. It was not changed. Inspect the database through the approved owner procedure; do not reset data."
  fi
  if [ "$database_state" != absent ]; then
    die "Local owner validation returned an unknown state; no credentials were changed."
  fi
  printf 'Provisioning the deterministic Development owner.\n'
  (
    backend_environment
    # The password is deliberately scoped to this command environment, never an argument or a file.
    export OMNIREST_PROVISION_PASSWORD='OmniRest-Local-2026!'
    cd "$BACKEND_DIR"
    dotnet "$BACKEND_DLL" --provision-owner "$OWNER_EMAIL" "$OWNER_RESTAURANT_ID" "$OWNER_DISPLAY_NAME"
  ) >> "$BACKEND_LOG" 2>&1
  [ "$(owner_database_state | tr -d '[:space:]')" = exact ] || die "Owner provisioning did not produce the exact active local owner state; marker was not written."
  write_owner_marker
}

print_ready() {
  (
    export OMNIREST_PROVISION_PASSWORD='OmniRest-Local-2026!'
    cat <<EOF

Omni REST local stack is ready.

Public: http://menu.localhost:3000
Admin:  http://menu.localhost:3000/admin/login
Owner email:    $OWNER_EMAIL
Owner password: $OMNIREST_PROVISION_PASSWORD

Logs:    $SCRIPT_NAME logs
Follow:  $SCRIPT_NAME logs -f
Status:  $SCRIPT_NAME status
Stop:    $SCRIPT_NAME stop

The PostgreSQL named volume and .local-run/media are persistent. This script never runs
docker compose down, down -v, volume removal, database reset, or data deletion.
Press Ctrl-C to stop the app processes and postgres service while preserving that data.
EOF
  )
}

run() {
  preflight
  # The lease and its FD are established before publishing a hard-linked lock.
  # That makes the lock independently verifiable during every start race.
  prepare_supervisor_lease
  trap trap_cleanup INT TERM
  trap cleanup EXIT
  acquire_run_lock
  mkdir -p "$STATE_DIR" "$MEDIA_DIR"
  chmod 700 "$STATE_DIR"
  (umask 077; printf 'omni-rest-local-run-v1\n' > "$STATE_MARKER")
  chmod 600 "$STATE_MARKER"
  : >> "$BACKEND_LOG"
  : >> "$FRONTEND_LOG"
  chmod 600 "$BACKEND_LOG" "$FRONTEND_LOG"
  create_lease backend
  create_lease frontend
  record_pid "$$" "$SUPERVISOR_PID_FILE" supervisor

  install_frontend_if_needed
  compose up -d --wait postgres >> "$BACKEND_LOG" 2>&1
  POSTGRES_STARTED=1
  (
    export OMNIREST_LOCAL_RUN_TOKEN="$RUN_TOKEN" OMNIREST_LOCAL_RUN_ROLE=backend
    exec 9< "$(lease_path "$RUN_TOKEN" backend)"
    backend_environment
    cd "$REPO_ROOT"
    dotnet tool restore
    dotnet restore "$BACKEND_SOLUTION"
    dotnet build "$BACKEND_SOLUTION" --no-restore
    dotnet ef database update --no-build --project "$BACKEND_PROJECT" --startup-project "$BACKEND_PROJECT"
    cd "$BACKEND_DIR"
    dotnet "$BACKEND_DLL" --seed-sample
  ) >> "$BACKEND_LOG" 2>&1

  provision_local_owner_if_needed

  (
    export OMNIREST_LOCAL_RUN_TOKEN="$RUN_TOKEN" OMNIREST_LOCAL_RUN_ROLE=backend
    exec 9< "$(lease_path "$RUN_TOKEN" backend)"
    backend_environment
    cd "$BACKEND_DIR"
    exec dotnet "$BACKEND_DLL" --urls http://127.0.0.1:5279
  ) >> "$BACKEND_LOG" 2>&1 &
  record_pid "$!" "$BACKEND_PID_FILE" backend
  wait_for_owned_process "$BACKEND_PID_FILE" backend "Backend"
  wait_for_backend

  build_frontend

  (
    export OMNIREST_LOCAL_RUN_TOKEN="$RUN_TOKEN" OMNIREST_LOCAL_RUN_ROLE=frontend
    exec 9< "$(lease_path "$RUN_TOKEN" frontend)"
    cd "$FRONTEND_DIR"
    export OMNI_REST_API_BASE_URL=http://127.0.0.1:5279
    export OMNI_REST_FORWARDED_PROTO=https
    exec node "$NEXT_BIN" start --hostname 127.0.0.1 --port 3000
  ) >> "$FRONTEND_LOG" 2>&1 &
  record_pid "$!" "$FRONTEND_PID_FILE" frontend
  wait_for_owned_process "$FRONTEND_PID_FILE" frontend "Frontend"
  wait_for_frontend
  print_ready

  while :; do
    backend_is_owned || { tail_logs; die "Backend exited; local supervisor is stopping."; }
    frontend_is_owned || { tail_logs; die "Frontend exited; local supervisor is stopping."; }
    sleep 1
  done
}

status_line() {
  local label="$1"
  local record="$2"
  local expected="$3"
  if pid_record_matches "$record" "$expected"; then
    printf '%-12s running (pid %s)\n' "$label" "$RECORDED_PID"
  elif [ -f "$record" ]; then
    printf '%-12s stale/unknown PID record (left untouched)\n' "$label"
  else
    printf '%-12s not recorded\n' "$label"
  fi
}

status() {
  printf 'Omni REST local-run status\n'
  if supervisor_record_matches; then
    printf '%-12s running (pid %s)\n' "supervisor" "$RECORDED_PID"
  elif [ -f "$SUPERVISOR_PID_FILE" ]; then
    printf '%-12s stale/unknown PID record (left untouched)\n' "supervisor"
  else
    printf '%-12s not recorded\n' "supervisor"
  fi
  status_line "backend" "$BACKEND_PID_FILE" backend
  status_line "frontend" "$FRONTEND_PID_FILE" frontend
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    printf '%-12s %s\n' "postgres" "$(compose ps --status running --services 2>/dev/null | grep -qx postgres && printf running || printf stopped)"
  else
    printf '%-12s docker unavailable\n' "postgres"
  fi
  if command -v curl >/dev/null 2>&1 && curl --noproxy '*' --fail --silent --max-time 3 --header 'Host: menu.localhost' http://127.0.0.1:5279/api/v1/public/restaurant >/dev/null; then
    printf '%-12s ready\n' "backend HTTP"
  else
    printf '%-12s unavailable\n' "backend HTTP"
  fi
  if command -v curl >/dev/null 2>&1 && curl --noproxy '*' --fail --silent --max-time 3 --resolve menu.localhost:3000:127.0.0.1 http://menu.localhost:3000/ >/dev/null; then
    printf '%-12s ready\n' "frontend HTTP"
  else
    printf '%-12s unavailable\n' "frontend HTTP"
  fi
}

logs() {
  local follow="${1:-}"
  [ -z "$follow" ] || [ "$follow" = "-f" ] || die "logs accepts only the optional -f flag."
  [ -f "$BACKEND_LOG" ] || die "No backend log exists yet. Start the stack first."
  [ -f "$FRONTEND_LOG" ] || die "No frontend log exists yet. Start the stack first."
  if [ "$follow" = "-f" ]; then
    exec tail -n 200 -f "$BACKEND_LOG" "$FRONTEND_LOG"
  fi
  tail -n 200 "$BACKEND_LOG" "$FRONTEND_LOG"
}

stop() {
  if [ ! -f "$STATE_MARKER" ]; then
    printf 'No Omni REST local-run state exists; nothing to stop.\n'
    return 0
  fi
  if supervisor_record_matches; then
    printf 'Signalling local supervisor (pid %s).\n' "$RECORDED_PID"
    kill -TERM "$RECORDED_PID"
    local attempt=0
    # The supervisor stops frontend then backend with bounded 20-second waits,
    # so this external wait must cover both orderly shutdowns plus Compose.
    while [ "$attempt" -lt 60 ]; do
      supervisor_record_matches || { printf 'Local stack stopped; persistent data was preserved.\n'; return 0; }
      sleep 1
      attempt=$((attempt + 1))
    done
    die "Supervisor did not stop after SIGTERM; leaving all processes untouched for safety."
  fi

  printf 'No live validated supervisor was found; performing safe child-process recovery.\n'
  terminate_valid_pid "$FRONTEND_PID_FILE" frontend "frontend"
  terminate_valid_pid "$BACKEND_PID_FILE" backend "backend"
  stop_postgres
  printf 'Local stack recovery completed; persistent data was preserved.\n'
}

case "${1:-run}" in
  run)
    [ "$#" -le 1 ] || { usage >&2; exit 2; }
    ensure_supervisor_identity
    run
    ;;
  status)
    [ "$#" -eq 1 ] || { usage >&2; exit 2; }
    status
    ;;
  logs)
    [ "$#" -le 2 ] || { usage >&2; exit 2; }
    logs "${2:-}"
    ;;
  stop)
    [ "$#" -eq 1 ] || { usage >&2; exit 2; }
    stop
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
