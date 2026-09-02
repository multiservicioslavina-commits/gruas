#!/usr/bin/env sh
# Instalador del software de taller. Deja todo funcionando con un comando.
set -e

echo ""
echo "  Instalando Taller Motos"
echo "  ─────────────────────────────────────────"

if ! command -v docker >/dev/null 2>&1; then
  echo "  ✗ No encuentro Docker."
  echo "    Instálalo primero desde https://docs.docker.com/get-docker/"
  echo "    y vuelve a ejecutar este archivo."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "  ✗ Tu Docker no trae 'docker compose'."
  echo "    Actualiza Docker a una versión reciente."
  exit 1
fi

if [ -f .env ]; then
  echo "  · Ya existe .env: se respeta tal como está."
else
  # Un secreto distinto en cada instalación. Sin openssl, se usa Docker.
  if command -v openssl >/dev/null 2>&1; then
    SECRETO=$(openssl rand -base64 48 | tr -d '\n')
  else
    SECRETO=$(docker run --rm node:20-alpine node -e \
      "console.log(require('crypto').randomBytes(48).toString('base64'))")
  fi
  CLAVE_BD=$(echo "$SECRETO" | cut -c1-24 | tr -d '/+=')

  sed -e "s|^JWT_SECRET=.*|JWT_SECRET=$SECRETO|" \
      -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$CLAVE_BD|" \
      .env.ejemplo > .env
  echo "  · Creado .env con claves propias de esta instalación."
fi

echo "  · Construyendo e iniciando (la primera vez tarda unos minutos)..."
docker compose up -d --build

PUERTO=$(grep '^PORT=' .env | cut -d= -f2)
PUERTO=${PUERTO:-3000}

# No todos los equipos traen curl. Si falta, se pregunta desde dentro del
# propio contenedor: si no, un instalador correcto diría que falló.
responde() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://localhost:$PUERTO/api/health" >/dev/null 2>&1
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null "http://localhost:$PUERTO/api/health" 2>/dev/null
  else
    docker compose exec -T app node -e \
      "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1
  fi
}

echo "  · Esperando a que responda..."
INTENTOS=0
while [ $INTENTOS -lt 60 ]; do
  if responde; then
    echo ""
    echo "  ✓ Listo."
    echo ""
    echo "    Abre:  http://localhost:$PUERTO"
    echo "    Crea tu taller desde la propia pantalla."
    echo ""
    echo "    Para detenerlo:  docker compose down"
    echo "    Para ver el registro:  docker compose logs -f app"
    echo ""
    exit 0
  fi
  INTENTOS=$((INTENTOS + 1))
  sleep 2
done

echo ""
echo "  · No pude confirmarlo automáticamente."
echo ""
echo "    Prueba a abrir:  http://localhost:$PUERTO"
echo "    Puede estar funcionando y ser sólo la comprobación."
echo ""
echo "    Si no abre, mira qué pasó con:"
echo "      docker compose logs app"
echo "      docker compose ps"
exit 1
