#!/bin/bash
set -e
cd "$(dirname "$0")"
exec node start-v3.mjs
