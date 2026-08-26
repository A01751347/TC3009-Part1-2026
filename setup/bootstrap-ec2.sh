#!/usr/bin/env bash
#
# Deja una instancia EC2 con Ubuntu Server lista para trabajar en el modulo.
#
# Se corre UNA VEZ, la primera vez que creas tu instancia:
#
#   bash setup/bootstrap-ec2.sh
#
# Instala git, Python con venv, Node, crea el entorno virtual, instala las
# dependencias del backend y del frontend.
#
# Es idempotente: si lo vuelves a correr no rompe nada.
#
# Usamos Ubuntu y no la imagen del proveedor de nube a proposito: lo que
# aprendas aqui se traslada igual a otro proveedor o a un servidor propio.

set -euo pipefail

VERDE="\033[32m"; AMARILLO="\033[33m"; ROJO="\033[31m"; RESET="\033[0m"
paso()  { echo -e "\n${VERDE}==>${RESET} $1"; }
aviso() { echo -e "${AMARILLO}AVISO:${RESET} $1"; }
falla() { echo -e "${ROJO}ERROR:${RESET} $1" >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "Preparando el entorno del modulo"
echo "  maquina : $(hostname)"
echo "  usuario : $(whoami)"
echo "  proyecto: $REPO_DIR"

if ! command -v apt-get >/dev/null 2>&1; then
  falla "este script es para Ubuntu. No se encontro apt-get."
fi

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------------
paso "Actualizando el indice de paquetes"
sudo apt-get update -qq

# ---------------------------------------------------------------------------
paso "Instalando git, Python y utilidades"
# python3-venv va aparte en Ubuntu: sin el, 'python3 -m venv' falla con un
# mensaje que no dice que falta instalar un paquete. Es una trampa clasica.
sudo apt-get install -y -qq \
  git \
  python3 \
  python3-venv \
  python3-pip \
  curl \
  ca-certificates \
  lsof

echo "    git    : $(git --version)"
echo "    Python : $(python3 --version)"

# ---------------------------------------------------------------------------
paso "Instalando Node.js con nvm"
# Usamos nvm y no el paquete de Ubuntu por dos razones:
#
#   1. El Node que trae la distribucion suele ir varias versiones atras.
#   2. nvm instala en tu carpeta personal, sin sudo, y permite cambiar de
#      version de Node por proyecto. Es la herramienta que vas a encontrar
#      en cualquier equipo que trabaje con Node.
#
# La version de nvm esta fijada a proposito, igual que las dependencias de
# Python: un script de instalacion que cambia bajo tus pies no es reproducible.
NVM_VERSION="v0.40.7"
export NVM_DIR="$HOME/.nvm"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash \
    || falla "no se pudo instalar nvm ${NVM_VERSION}. Revisa la salida a internet."
  echo "    nvm ${NVM_VERSION} instalado"
else
  echo "    nvm ya estaba instalado"
fi

# nvm es una FUNCION DE SHELL, no un binario. Instalarlo no basta: hay que
# cargarlo en la sesion actual, y son estas tres lineas -- las mismas que el
# propio instalador de nvm imprime al terminar:
#
#   export NVM_DIR="$HOME/.nvm"
#   [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
#   [ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
#
# Si no se ejecutan, el comando 'nvm' simplemente no existe y el mensaje es
# "nvm: command not found" justo despues de haberlo instalado.
#
# El 'set +eu' es necesario: nvm.sh referencia variables sin definir y devuelve
# codigos distintos de cero en operacion normal, asi que con 'set -euo pipefail'
# activo el propio source aborta el script.
echo "    cargando nvm en esta sesion..."
set +eu
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
set -eu

command -v nvm >/dev/null 2>&1 \
  || falla "nvm quedo instalado pero no se pudo cargar en esta sesion. Revisa $NVM_DIR/nvm.sh"

# --lts instala la version de soporte extendido vigente, sin fijar un numero
# que envejezca en el material del curso.
#
# 'set +u' de nuevo: las funciones internas de nvm tampoco toleran que se
# aborte por variables sin definir.
set +u
nvm install --lts
nvm alias default 'lts/*' >/dev/null 2>&1 || true
nvm use --lts >/dev/null 2>&1 || true
set -u

command -v node >/dev/null 2>&1 || falla "nvm instalo Node pero no quedo en el PATH"
echo "    Node   : $(node --version)  (LTS)"
echo "    npm    : $(npm --version)"

NODE_MAYOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
if (( NODE_MAYOR < 18 )); then
  falla "Node $NODE_MAYOR es demasiado viejo; el proyecto necesita 18 o superior"
fi

# ---------------------------------------------------------------------------
paso "Creando el entorno virtual de Python"
if [[ ! -d "$REPO_DIR/.venv" ]]; then
  python3 -m venv "$REPO_DIR/.venv"
  echo "    creado en .venv/"
else
  echo "    ya existe"
fi

paso "Instalando las dependencias del backend"
"$REPO_DIR/.venv/bin/pip" install -q --upgrade pip
"$REPO_DIR/.venv/bin/pip" install -q -r "$REPO_DIR/backend/requirements.txt"
echo "    listo"

# ---------------------------------------------------------------------------
paso "Instalando las dependencias del frontend"
if [[ -f "$REPO_DIR/frontend/package.json" ]]; then
  ( cd "$REPO_DIR/frontend" && npm install --silent --no-fund --no-audit )
  echo "    listo"
else
  aviso "frontend/package.json no existe todavia; se omite"
fi

# ---------------------------------------------------------------------------
paso "Verificacion"
"$REPO_DIR/.venv/bin/python" - <<'PY'
import sys
faltan = []
for mod in ("flask", "flask_cors", "pandas", "numpy", "sklearn", "joblib"):
    try:
        __import__(mod)
    except ImportError:
        faltan.append(mod)
if faltan:
    print("    FALTAN:", ", ".join(faltan))
    sys.exit(1)
print("    todas las bibliotecas de Python responden")
PY

if [[ -d "$REPO_DIR/frontend/node_modules" ]]; then
  echo "    dependencias del frontend instaladas"
fi

echo
echo -e "${VERDE}Entorno listo.${RESET}"
echo
echo "Todos los comandos del modulo se invocan igual, desde la raiz del"
echo "proyecto. Siempre con la ruta completa: asi funcionan sin depender de"
echo "que tu terminal haya leido ningun archivo de configuracion."
echo
echo "    ./setup/run start      levanta la API y el tablero"
echo "    ./setup/run url        en que direccion esta tu tablero"
echo "    ./setup/run sync       trae lo que empujaste desde tu laptop"
echo "    ./setup/run restart    relanzalos con el codigo nuevo"
echo "    ./setup/run status     que esta corriendo"
echo "    ./setup/run logs       que paso"
echo "    ./setup/run stop       detenlos"
echo "    ./setup/run doctor     revisa el entorno y dice que falta"
echo
echo "Empieza con:"
echo "    ./setup/run doctor"
echo
echo "El security group debe tener abiertos los puertos 3000 y 8080."
