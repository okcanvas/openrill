#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
python scripts/run_step014a_acceptance.py "$@"
