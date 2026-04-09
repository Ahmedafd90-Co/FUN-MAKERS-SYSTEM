#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
#
# Installs Node 20 and the Semgrep CLI into the ephemeral web sandbox so the
# SessionStart hooks shipped by user-scoped plugins (learning-output-style,
# superpowers, semgrep) can run without `command not found` errors.
#
# Idempotent. Only runs in remote (cloud) sessions — locally these tools
# should already be managed by the developer.

log() { printf '[session-start] %s\n' "$1" >&2; }

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  log "not a remote session — skipping"
  exit 0
fi

# --- Node 20 -----------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  log "node not found — installing Node 20 via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >&2
  apt-get install -y nodejs >&2
  log "installed node $(node --version)"
else
  log "node present: $(node --version)"
fi

# --- Semgrep -----------------------------------------------------------------
if ! command -v semgrep >/dev/null 2>&1; then
  log "semgrep not found — installing via pip"
  pip install --quiet --ignore-installed pyjwt semgrep >&2
  log "installed semgrep $(semgrep --version)"
else
  log "semgrep present: $(semgrep --version)"
fi
