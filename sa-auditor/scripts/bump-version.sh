#!/usr/bin/env bash
# Sube la versión de la extensión en manifest.json.
#
# La Chrome Web Store EXIGE que cada publicación tenga una versión mayor que la
# anterior. Este script te ahorra editar el JSON a mano.
#
# Uso:
#   bash scripts/bump-version.sh            # sube el último número:  0.1.0 -> 0.1.1
#   bash scripts/bump-version.sh minor      # 0.1.0 -> 0.2.0
#   bash scripts/bump-version.sh major      # 0.1.0 -> 1.0.0
#   bash scripts/bump-version.sh 1.2.3      # pone exactamente esa versión
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAN="$ROOT/extension/manifest.json"
ARG="${1:-patch}"

CUR="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$MAN" | head -1 | grep -oE '[0-9][0-9A-Za-z.]*')"
IFS='.' read -r MA MI PA <<< "$CUR"
MA="${MA:-0}"; MI="${MI:-0}"; PA="${PA:-0}"

case "$ARG" in
  patch) PA=$((PA+1));;
  minor) MI=$((MI+1)); PA=0;;
  major) MA=$((MA+1)); MI=0; PA=0;;
  *.*.*) NEW="$ARG";;
  *) echo "Argumento no válido: $ARG (usa patch|minor|major|X.Y.Z)" >&2; exit 1;;
esac
NEW="${NEW:-$MA.$MI.$PA}"

# Reemplaza solo la primera línea de "version".
python3 - "$MAN" "$NEW" <<'PY'
import re, sys
path, new = sys.argv[1], sys.argv[2]
with open(path) as f: s = f.read()
s2 = re.sub(r'("version"\s*:\s*")[^"]+(")', r'\g<1>'+new+r'\g<2>', s, count=1)
with open(path, 'w') as f: f.write(s2)
PY

echo "Versión: $CUR -> $NEW"
echo "Ahora: git add -A && git commit -m \"sa-auditor v$NEW\" && git tag sa-auditor-v$NEW && git push --follow-tags"
