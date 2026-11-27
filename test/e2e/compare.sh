#!/usr/bin/env bash
# Puts each reference screen next to our screen from a walkthrough run.
# Usage: HM_REF_DIR=<dir with inbox.png and terminal.png> test/e2e/compare.sh /tmp/hm-e2e
# Writes /tmp/hm-e2e/cmp-*.png. Keep reference images out of the repository.
set -euo pipefail
out=${1:?walkthrough output dir}
ref=${HM_REF_DIR:?set HM_REF_DIR to the folder with the reference images}
for pair in inbox:01-inbox terminal:05-terminal; do
  r=${pair%%:*} o=${pair##*:}
  magick \( "$ref/$r.png" -resize x1311 \) \( "$out/$o.png" -resize x1311 \) +append -resize 50% "$out/cmp-$r.png"
  echo "$out/cmp-$r.png"
done
