#!/usr/bin/env bash
# Start the Qwen3-VL-4B llama-server that passed the server life-scene screen.
set -euo pipefail
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mapfile -t ARGV < <(node "$DIR/runtime.cjs" argv)
exec "${ARGV[@]}"
