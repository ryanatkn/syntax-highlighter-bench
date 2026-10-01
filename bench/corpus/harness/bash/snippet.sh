#!/usr/bin/env bash
set -euo pipefail

# Back up a directory to a dated archive.
src="${1:?usage: backup.sh <dir> [dest]}"
dest="${2:-$HOME/backups}"
stamp="$(date +%Y-%m-%d)"

mkdir -p "$dest"

if [[ ! -d "$src" ]]; then
	echo "not a directory: $src" >&2
	exit 1
fi

for file in "$src"/*.log; do
	[ -e "$file" ] || continue
	gzip -k "$file"
done

tar -czf "$dest/$(basename "$src")-$stamp.tar.gz" -C "$src" . && echo "saved to $dest"
