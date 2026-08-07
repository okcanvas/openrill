#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
python scripts/run_step013b1_acceptance.py
