#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js e npm nao encontrados. Instale Node.js 22 LTS e tente novamente."
  exit 1
fi
node -e "const n=Number(process.versions.node.split('.')[0]); if(n<20){console.error('Node.js 20+ necessario; atual:',process.version);process.exit(1)}"
if [ ! -d node_modules ]; then
  echo "Instalando as dependencias do VANO..."
  npm install
fi
echo "Iniciando VANO em http://localhost:5174"
npm run dev
