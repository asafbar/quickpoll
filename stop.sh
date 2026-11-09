#!/bin/bash

set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Stopping QuickPoll development servers..."

stop_port() {
  local port="$1"
  local expected_dir="$2"
  local pids pid command cwd attempts

  pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

  if [ -z "$pids" ]; then
    echo "Port $port: already free"
    return
  fi

  for pid in $pids; do
    command=$(ps -p "$pid" -o command= 2>/dev/null || true)
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)

    if [[ "$cwd" != "$ROOT_DIR/$expected_dir" && "$command" != *"$ROOT_DIR/$expected_dir"* ]]; then
      echo "Port $port: PID $pid is not verified as QuickPoll; skipping"
      continue
    fi

    echo "Stopping port $port (PID $pid)..."
    kill -TERM "$pid" 2>/dev/null || true

    for ((attempts=0; attempts<20; attempts++)); do
      if ! lsof -nP -a -p "$pid" -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | grep -q .; then
        break
      fi
      sleep 0.2
    done

    if lsof -nP -a -p "$pid" -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | grep -q .; then
      echo "PID $pid did not exit gracefully."
      echo "Leaving it running rather than forcing a kill."
    fi
  done
}

stop_port 3001 "server"
stop_port 5173 "client"

echo
echo "Final port status:"
for port in 3001 5173; do
  if lsof -nP -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port: still occupied"
  else
    echo "Port $port: free"
  fi
done

echo "PostgreSQL was left running."
