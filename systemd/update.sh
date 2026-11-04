#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Builds as the current user and asks for sudo only while installing.
exec make -C "$(dirname "$SCRIPT_DIR")" update
