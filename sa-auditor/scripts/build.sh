#!/usr/bin/env bash
# Empaqueta la extensión SA Auditor en un .zip listo para subir a la Chrome Web Store.
#
# Uso:
#   bash scripts/build.sh
#
# Salida:
#   dist/sa-auditor-extension-<version>.zip   (y un alias dist/sa-auditor-extension.zip)
#
# No necesitas ejecutar esto a mano para publicar: el workflow de GitHub Actions
# lo corre solo. Te sirve si quieres generar el zip localmente para una prueba.
set -euo pipefail

# Carpeta raíz del proyecto (un nivel arriba de scripts/)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/extension"
OUT="$ROOT/dist"

if [[ ! -f "$SRC/manifest.json" ]]; then
  echo "ERROR: no encuentro $SRC/manifest.json" >&2
  exit 1
fi

# Lee la versión del manifest (sin depender de jq).
VERSION="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$SRC/manifest.json" | head -1 | grep -oE '[0-9][0-9A-Za-z.]*')"
if [[ -z "${VERSION:-}" ]]; then
  echo "ERROR: no pude leer la versión del manifest." >&2
  exit 1
fi

mkdir -p "$OUT"
ZIP="$OUT/sa-auditor-extension-$VERSION.zip"
ALIAS="$OUT/sa-auditor-extension.zip"
rm -f "$ZIP" "$ALIAS"

# Empaqueta solo el contenido de extension/ (rutas relativas a esa carpeta, como
# espera la Web Store). Excluye basura del sistema.
( cd "$SRC" && zip -r -X "$ZIP" . \
    -x '*.DS_Store' -x '__MACOSX/*' -x '*.map' -x '*/.*' >/dev/null )

cp "$ZIP" "$ALIAS"

echo "OK  → $ZIP"
echo "    (alias: $ALIAS)"
echo "    versión: $VERSION"
