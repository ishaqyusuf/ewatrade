#!/bin/sh

set -eu

default_ports="${EWATRADE_KILL_PORTS:-3002 3091 3092 3093 3094 3095 5555}"

ports=$(
  {
    printf "%s\n" $default_ports
    env | awk -F= '
      ($1 == "PORT" || $1 ~ /_PORT$/) &&
      $1 !~ /(DB|DATABASE|POSTGRES).*_PORT$/ &&
      $1 !~ /PORTLESS_(ROOT_DOMAIN|WILDCARD|SYNC_HOSTS)$/ &&
      $2 ~ /^[0-9]+$/ &&
      $2 >= 1 &&
      $2 <= 65535 {
        print $2
      }
    '
  } | awk '
    /^[0-9]+$/ && $1 >= 1 && $1 <= 65535 {
      print $1
    }
  ' | sort -n -u
)

if [ -z "$ports" ]; then
  echo "No dev ports found to kill."
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
