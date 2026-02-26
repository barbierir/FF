#!/usr/bin/env bash
set -euo pipefail

echo "Running zero-deps Node test suite..."
echo ""

# Check Node version
NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node 20+ required (current: v$NODE_VERSION)"
  exit 1
fi

run() {
  echo "→ $1"
  node --experimental-strip-types "$1"
  echo ""
}

run tests/run_determinism.ts
run tests/run_server_flow.ts
run tests/run_economy_flow.ts
run tests/run_replay_page.ts

if [ -f tests/run_hardening.ts ]; then
  run tests/run_hardening.ts
fi

echo "-----------------------------------------"
echo "All zero-deps tests passed successfully 💨"
echo "-----------------------------------------"
