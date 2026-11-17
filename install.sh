#!/bin/sh
# Installs ABC Lyrics into Spicetify (macOS/Linux):
#   curl -fsSL https://raw.githubusercontent.com/vitgruib/spicetify-abc-lyrics/main/install.sh | sh
set -e

command -v spicetify >/dev/null || {
  echo "Spicetify isn't installed. Install it first: https://spicetify.app" >&2
  exit 1
}

dir="$(spicetify path userdata)/Extensions"
mkdir -p "$dir"
curl -fsSL https://raw.githubusercontent.com/vitgruib/spicetify-abc-lyrics/main/abc-lyrics.js -o "$dir/abc-lyrics.js"

# `spicetify config extensions X` appends, so only add it once.
grep -Eq '^extensions *=.*abc-lyrics\.js' "$(spicetify -c)" || spicetify config extensions abc-lyrics.js
spicetify apply
echo "ABC Lyrics installed. Click the 拼 button in Spotify's top bar for options."
