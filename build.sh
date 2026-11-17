#!/bin/sh
# Bundles the vendored libraries (opencc-js 1.0.5 t2cn, pinyin-pro 3.26.0) with
# src/chinese-lyrics.js into the single file Spicetify loads. Each library runs
# with exports/module/define shadowed so its UMD wrapper sets a global.
set -e
cd "$(dirname "$0")"
{
  echo "// Built by build.sh from src/chinese-lyrics.js. Edit the source, not this file."
  for lib in vendor/opencc-t2cn.js vendor/pinyin-pro.js; do
    echo "(function (exports, module, define) {"
    cat "$lib"
    echo "}).call(globalThis);"
  done
  cat src/chinese-lyrics.js
} > chinese-lyrics.js
