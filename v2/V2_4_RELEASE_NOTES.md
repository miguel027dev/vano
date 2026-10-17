# VANO Maps V2.4 — Atlas

Atualização focada em UX/UI, entrada e perfil, não em substituição do backend de rotas.

**Destaques:**
- Nova entrada mobile-first com ilustração vetorial de ruas e CTA claro.
- Perfil inteiramente reconstruído e sem card preto, métricas e histórico verdadeiros, veículo selecionado e atalhos.
- Login/cadastro refinados em uma identidade coerente com a VANO.
- Novos assets vetoriais `public/vano-city-lines.svg` e `public/vano-trip-line.svg`, mantendo o logo original e imagens carro/moto.
- Componentes de mapa, formulários, cartões e navegação com refinamento CSS e movimento reduzido.
- Link dos favoritos corrigido na página de rotas.
- Script `iniciar-v2.sh --rede`: fornece URL para celular e, se o UFW estiver ativo, solicita permissão para liberar somente a porta TCP 5174 na sub-rede local.

Não sobrescreve `.env`, `data/store.json`, nem modifica a V1.

**Acesso:** computador `http://localhost:5174/inicio`; celular `http://IP_DO_COMPUTADOR:5174/inicio` no mesmo Wi-Fi. Geolocalização no IP em HTTP pode ser bloqueada; usar origem manual até configurar HTTPS confiável. Não use senhas reais em teste de rede HTTP.
