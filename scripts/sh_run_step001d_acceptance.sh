#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
python scripts/run_step001d_acceptance.py "$@"
