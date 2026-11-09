#!/bin/bash
set -u

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd) || exit 1
cd "$project_root" || exit 1

fail() {
  printf 'QuickPoll: %s\n' "$1" >&2
  exit 1
}

check_ports() {
  local port listeners occupied=0
  for port in 3001 5173; do
    if listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN); then
      printf '\nPort %s is already in use:\n%s\n' "$port" "$listeners" >&2
      occupied=1
    fi
  done
  if (( occupied )); then
    fail "Stop the existing services from their own terminals, then run ./dev.sh again."
  fi
}

for tool in docker npm node curl lsof; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required and was not found on PATH."
done

for env_file in .env server/.env client/.env.local; do
  if [[ ! -f "$env_file" || ! -r "$env_file" ]]; then
    fail "Required environment file is missing or unreadable: $env_file"
  fi
done

check_ports
docker info >/dev/null 2>&1 || fail "Cannot reach Docker. Start Docker Desktop and check your Docker context."
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is required."

printf 'Starting PostgreSQL (db)…\n'
docker compose up -d db || fail "Docker Compose could not start db."
db_container=$(docker compose ps -q db) || fail "Could not identify the db container."
[[ -n "$db_container" ]] || fail "No running db container found. Check docker compose logs db."

printf 'Waiting for PostgreSQL health check…\n'
db_deadline=$((SECONDS + 60))
while :; do
  db_health=$(docker inspect --format '{{if .State.Running}}{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}{{else}}stopped{{end}}' "$db_container") ||
    fail "Could not inspect the db container."
  case "$db_health" in
    healthy) break ;;
    starting|unhealthy) ;;
    *) fail "Unexpected db state ($db_health). Check docker compose logs db." ;;
  esac
  (( SECONDS < db_deadline )) || fail "PostgreSQL did not become healthy within 60 seconds. Check docker compose logs db."
  sleep 1
done

# Check again after the database wait in case another service started meanwhile.
check_ports

server_pid=""
client_pid=""
cleanup() {
  local status=$? pid deadline running
  trap - EXIT
  trap '' INT TERM

  if [[ -n "$server_pid$client_pid" ]]; then
    printf '\nStopping QuickPoll processes started by this script…\n'
  fi
  for pid in "$server_pid" "$client_pid"; do
    if [[ -n "$pid" ]]; then
      kill -TERM -- "-$pid" 2>/dev/null || true
    fi
  done

  deadline=$((SECONDS + 5))
  while (( SECONDS < deadline )); do
    running=0
    for pid in "$server_pid" "$client_pid"; do
      if [[ -n "$pid" ]] && kill -0 -- "-$pid" 2>/dev/null; then
        running=1
      fi
    done
    (( running )) || break
    sleep 1
  done
  for pid in "$server_pid" "$client_pid"; do
    if [[ -n "$pid" ]]; then
      if kill -0 -- "-$pid" 2>/dev/null; then
        printf 'Process group %s is still running after SIGTERM. Check it manually.\n' "$pid" >&2
      else
        wait "$pid" 2>/dev/null || true
      fi
    fi
  done
  printf 'PostgreSQL was left running.\n'
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Bash monitor mode gives each npm job a separate process group, including its children.
# Disconnect stdin so a background nodemon job cannot stop on a terminal read.
set -m
printf 'Starting backend and frontend…\n'
(cd server && exec npm run dev) </dev/null &
server_pid=$!
(cd client && exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort) </dev/null &
client_pid=$!
# Keep later foreground checks in the launcher's terminal group for Ctrl+C.
set +m

check_jobs() {
  kill -0 "$server_pid" 2>/dev/null || fail "The backend exited. Check the server output above."
  kill -0 "$client_pid" 2>/dev/null || fail "The frontend exited. Check the client output above."
}

api_health=http://127.0.0.1:3001/api/health/db
client_home=http://127.0.0.1:5173/
app_deadline=$((SECONDS + 30))
while :; do
  check_jobs
  if curl -fsS --noproxy '*' --max-time 2 "$api_health" >/dev/null 2>&1 &&
     curl -fsS --noproxy '*' --max-time 2 "$client_home" >/dev/null 2>&1; then
    check_jobs
    break
  fi
  (( SECONDS < app_deadline )) || fail "Backend database health and frontend readiness did not both pass within 30 seconds. Check the output above."
  sleep 1
done

lan_ip=""
default_interface=$(route -n get default 2>/dev/null | awk '$1 == "interface:" { print $2; exit }')
for interface in "$default_interface" en0 en1; do
  case "$interface" in
    en[0-9]*|bridge[0-9]*)
      if lan_ip=$(ipconfig getifaddr "$interface" 2>/dev/null) && [[ -n "$lan_ip" ]]; then
        break
      fi
      ;;
  esac
done

printf '\nQuickPoll is ready.\n'
printf '  Frontend (local)   http://localhost:5173/\n'
printf '  Backend health     http://localhost:3001/api/health/db\n'
if [[ -n "$lan_ip" ]]; then
  printf '  Frontend (LAN)     http://%s:5173/\n' "$lan_ip"
  printf '  Use this LAN origin in client/.env.local for public links and QR codes.\n'
else
  printf '  Frontend (LAN)     Could not detect an IPv4 address. Check macOS Network settings.\n'
fi
printf '\nPress Ctrl+C to stop the frontend and backend. PostgreSQL stays running.\n'

while :; do
  check_jobs
  sleep 1
done
