#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
python scripts/run_step004_acceptance.py "$@"
