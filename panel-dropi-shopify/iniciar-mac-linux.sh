#!/usr/bin/env sh
# Inicia el panel y lo abre en el navegador.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js. Descárgalo de https://nodejs.org (versión LTS), instálalo y vuelve a ejecutar este archivo."
  echo ""
  exit 1
fi
URL="http://localhost:${PORT:-3000}"
( sleep 1; if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi ) >/dev/null 2>&1 &
exec node server.js
