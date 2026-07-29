#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

exec bun "$ROOT_DIR/../local-infra-kit/bin/dev-services.ts" \
  --profile ewatrade \
  --mode local
