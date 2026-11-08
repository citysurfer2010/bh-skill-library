#!/usr/bin/env bash
# Fuenf Pflicht-Suiten. Rot = kein Commit.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_NO_WARNINGS=1
node --test test/validate.test.js test/smoke.test.js test/rbac.test.js test/restart.test.js test/e2e.test.js
