#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR/.."
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
python scripts/run_step013ar2_acceptance.py
