#!/bin/sh
# Builds the card for older browsers too (old iPads run Safari 12+ and get
# Home Assistant's legacy frontend). Edit src/, then run ./build.sh.
set -e
cd "$(dirname "$0")"
npx -y esbuild@0.24.0 src/habit-tracker-card.js \
  --target=safari12 \
  --banner:js="/* Generated from src/habit-tracker-card.js by build.sh; do not edit. */" \
  --outfile=custom_components/habit_tracker/frontend/habit-tracker-card.js
