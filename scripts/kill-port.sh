#!/bin/sh

set -eu

ports=$(
  env | awk -F= '
    $1 ~ /_PORT$/ &&
    $1 !~ /PORTLESS/ &&
    $2 ~ /^[0-9]+$/ &&
    $2 >= 1 &&
    $2 <= 65535 {
      print $2
    }
  ' | sort -n -u
)

if [ -z "$ports" ]; then
  echo "No *_PORT env values found to kill."
  exit 0
fi

for port in $ports; do
  pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)

  if [ -z "$pids" ]; then
    echo "Port $port is free."
    continue
  fi

  echo "Killing processes on port $port: $pids"
  kill -9 $pids 2>/dev/null || true
done
