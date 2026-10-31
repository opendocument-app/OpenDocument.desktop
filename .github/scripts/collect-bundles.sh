#!/usr/bin/env bash
# collect-bundles.sh <bundle dir> <out dir> <version> <platform>
#
# Copies the installers that `tauri build` wrote into <out dir>, under names
# without spaces: OpenDocument-Reader_<version>_<platform>.<ext>.
set -euo pipefail
bundle=$1 out=$2 version=$3 platform=$4
mkdir -p "$out"
found=0
while IFS= read -r -d '' file; do
  name=$(basename "$file")
  case "$name" in
    *-setup.exe) ext=setup.exe ;;
    *.AppImage) ext=AppImage ;;
    *) ext=${name##*.} ;;
  esac
  cp "$file" "$out/OpenDocument-Reader_${version}_${platform}.${ext}"
  found=$((found + 1))
done < <(find "$bundle" -maxdepth 2 -type f \
  \( -name '*.dmg' -o -name '*.msi' -o -name '*-setup.exe' -o -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) -print0)
if [ "$found" -eq 0 ]; then
  echo "::error::no installers under $bundle"
  exit 1
fi
ls -la "$out"
