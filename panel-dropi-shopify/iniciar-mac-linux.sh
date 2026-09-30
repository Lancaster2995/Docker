#!/usr/bin/env sh
# Inicia el panel y lo abre en el navegador cuando está listo.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js. Descárgalo de https://nodejs.org (versión LTS), instálalo y vuelve a ejecutar este archivo."
  echo ""
  exit 1
fi
ABRIR_NAVEGADOR=1 exec node server.js
