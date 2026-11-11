#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${1:-}" == "--https" ]]; then
  exec bash ./iniciar-v2-https.sh
fi
export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null || true
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Node.js/npm ausentes. Instale Node.js 22 para continuar.'; exit 1
fi

# Existing local tokens and user account database are never overwritten.
if [[ ! -f .env ]]; then
  cat > .env <<'CONFIG'
VITE_MAPBOX_PUBLIC_TOKEN=
MAPBOX_SECRET_TOKEN=
VITE_GOOGLE_CLIENT_ID=
VITE_API_URL=/api
API_PORT=8878
VITE_DEMO_MODE=false
VANO_V1_API_URL=
CONFIG
  chmod 600 .env
fi

chmod 600 .env
# Private, single-instance store: tighten only the application's own data directory.
mkdir -p data
chmod 700 data
[[ ! -f data/store.json ]] || chmod 600 data/store.json
[[ ! -f data/store.json.bak ]] || chmod 600 data/store.json.bak
# Import only a public pk.* Mapbox token from the earlier local VANO if missing.
if grep -q '^VITE_MAPBOX_PUBLIC_TOKEN=$' .env; then
  for OLD in "$HOME/Projetos/VANO/vano-react-local/.env"; do
    [[ -f "$OLD" ]] || continue
    PUBLIC_TOKEN="$(sed -n 's/^VITE_MAPBOX_PUBLIC_TOKEN=//p' "$OLD" | head -1 | tr -d '\r')"
    if [[ "$PUBLIC_TOKEN" == pk.* ]]; then
      PUBLIC_TOKEN="$PUBLIC_TOKEN" python3 - <<'PY'
from pathlib import Path
import os
p=Path('.env');s=p.read_text();p.write_text(s.replace('VITE_MAPBOX_PUBLIC_TOKEN=', 'VITE_MAPBOX_PUBLIC_TOKEN='+os.environ['PUBLIC_TOKEN'],1));p.chmod(0o600)
print('Token público Mapbox importado da instalação local anterior.')
PY
      break
    fi
  done
fi

# --rede: limit firewall access to the current local IPv4 subnet, when UFW is active.
if [[ "${1:-}" == "--rede" ]]; then
  if command -v ufw >/dev/null 2>&1; then
    if sudo ufw status 2>/dev/null | grep -q 'Status: active'; then
      LAN_DEVICE="$(ip -4 route show default 2>/dev/null | awk 'NR==1 {for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}')"
      NET="$(ip -o -4 addr show dev "$LAN_DEVICE" scope global 2>/dev/null | awk '$4 ~ /^(10\.|172\.|192\.168\.)/ {print $4; exit}')"
      if [[ -n "$NET" ]]; then
        SUBNET="$(NET="$NET" python3 - <<'PY'
import ipaddress,os
try: print(ipaddress.ip_interface(os.environ['NET']).network)
except Exception: print('')
PY
)"
        if [[ -n "$SUBNET" ]]; then
          echo "Permitindo VANO somente na rede local $SUBNET (TCP 5174)..."
          sudo ufw allow from "$SUBNET" to any port 5174 proto tcp || echo 'A regra de firewall não foi aplicada; verifique UFW.'
        fi
      else
        echo 'Não foi possível detectar a sub-rede privada. Configure UFW manualmente, se necessário.'
      fi
    else
      echo 'UFW desativado ou indisponível: nenhuma regra nova necessária.'
    fi
  fi
fi

if [[ ! -x node_modules/.bin/vite ]]; then
  echo 'Instalando dependências do VANO V2.6...'
  npm install --no-audit
fi

PROTO=http
if [[ "${VANO_DEV_HTTPS:-0}" == "1" ]]; then PROTO=https; fi
echo ''
echo "VANO Maps V2.6 — acesso neste computador: $PROTO://localhost:5174/inicio"
if command -v hostname >/dev/null 2>&1; then
  LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')"
  if [[ -z "$LAN_IP" ]]; then LAN_IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | awk '/^(192\.168\.|10\.|172\.)/ {print; exit}')"; fi
  if [[ -n "$LAN_IP" ]]; then
    echo "VANO Maps V2.6 — no celular (mesmo Wi-Fi): $PROTO://$LAN_IP:5174/inicio"
    if [[ "$PROTO" == 'http' ]]; then echo 'GPS no celular: use --https com certificado confiável ou marque origem manual.'; else echo 'GPS no celular: exige instalar/confiar na CA local no aparelho e permitir a localização.'; fi
  fi
fi
echo 'ATENÇÃO: servidor Vite apenas para desenvolvimento; NÃO publique esta porta na internet.'
echo 'Contas pelo IP HTTP são bloqueadas; use --https no celular ou localhost no computador.'
echo 'Mantenha este terminal aberto enquanto usa a V2.'
echo ''
npm run dev
