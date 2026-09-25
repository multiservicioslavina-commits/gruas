#!/usr/bin/env bash
# Renderiza las piezas de promoción de Ridera a PNG con Chromium headless.
#   ./render.sh            → todas las piezas
set -euo pipefail

CHROME=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
cd "$(dirname "$0")"
mkdir -p out

# render <archivo.html> <ancho_css> <alto_css> [escala]
render () {
  local file=$1 w=$2 h=$3 scale=${4:-1}
  "$CHROME" --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor="$scale" \
    --window-size="$w,$h" \
    --screenshot="out/${file%.html}.png" \
    "file://$PWD/$file" >/dev/null 2>&1
  echo "  out/${file%.html}.png  ($((w*scale))x$((h*scale)))"
}

echo "Renderizando:"
render story.html 1080 1920        # Instagram/WhatsApp story
render post.html  1080 1080        # feed cuadrado
render flyer.html 1240 1754 2      # A4 vertical a 300 ppp
echo "Listo."

# PDF A4 del volante, para imprenta
/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
  --disable-gpu --no-sandbox --no-pdf-header-footer \
  --print-to-pdf=out/flyer.pdf "file://$PWD/flyer.html" >/dev/null 2>&1 \
  && echo "  out/flyer.pdf  (A4)"
