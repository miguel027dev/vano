#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Only used when explicitly requested. No remote tunnel, no public internet exposure.
if ! command -v mkcert >/dev/null 2>&1; then
  echo 'HTTPS local: falta mkcert. No Zorin, instale: sudo apt install -y mkcert libnss3-tools'
  exit 1
fi
IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')"
if [[ -z "$IP" ]]; then echo 'Não encontrei um IP de rede local. Conecte o computador ao Wi-Fi e tente de novo.'; exit 1; fi
mkdir -p .local-https
chmod 700 .local-https
mkcert -install
# Regenerate on LAN IP changes (refreshing it is safe for local preview).
mkcert -cert-file .local-https/vano-local.pem -key-file .local-https/vano-local-key.pem localhost 127.0.0.1 "$IP" >/dev/null
chmod 600 .local-https/vano-local-key.pem
printf '\nVANO V2.5 HTTPS: https://%s:5174/inicio\n' "$IP"
echo 'Importante: no celular é preciso instalar/confiar no certificado CA (rootCA.pem), obtido em: mkcert -CAROOT'
echo 'NUNCA transfira rootCA-key.pem para o celular. A CA é somente para seus dispositivos confiáveis.'
echo 'Sem a CA confiável no celular, o navegador continuará bloqueando a geolocalização.'
export VANO_DEV_HTTPS=1
exec bash ./iniciar-v2.sh --rede
