# VANO V2.5 — Revisão de usabilidade (candidata local)

Esta atualização é **somente para a prévia V2** (`5174`), não para o site VANO principal.

## Decisões do briefing

- Tela de entrada sem card que simula aplicativo; apenas logo original, proposta curta, ações e um traço de rota.
- Em telas pequenas (320–390 px), manter o conteúdo essencial visível, sem truncamento e sem rolagem horizontal. Se houver fonte ampliada ou acessibilidade, permitir rolagem vertical naturalmente em vez de cortar.
- Mapas: símbolo VANO sem wordmark; busca e chips deslocados para a parte superior, preservando as safe areas.
- Perfil: navegação inferior flutuante com superfície neutra, quatro destinos fixos (Mapa, Rotas, Salvos, Perfil); renderizada via React Portal para não ser deslocada pela animação da página.
- Card “Seu jeito de navegar”: carro com fundo transparente. A mesma arte do veículo é reaproveitada na personalização; modelo da moto continua.
- Origem/destino: edição por busca usando API real, seleção manual no mapa, menus de três pontos e inversão funcional que recalcule o trajeto. **Nunca** trocar fisicamente o GPS em tempo real.
- Movimento: animações curtas de entrada, traço da rota, popover, foco e navegação; sem animações constantes bloqueando a interação, respeitando `prefers-reduced-motion`.

## Correções implementadas

1. O controle anterior de troca de origem/destino era visual e não chamava handler. Agora chama `swapJourney`, atualiza origem manual/destino e recalcula a viagem.
2. A tela antiga de “Trocar destino” dependia da lista local. Agora o modal usa `GET /api/search` com debounce, `AbortController` e resultados associados ao ponto correto.
3. Menus de origem/destino com ações específicas, clique fora e tecla Escape.
4. Layout compactado da busca e atalhos, somente símbolo da logo no mapa.
5. Navegação inferior movida para portal `document.body` (a animação do ancestral estava quebrando `position: fixed`).
6. Carro recortado em PNG com canal alpha; não altera a identidade da VANO nem cria logo nova.
7. GPS: feedback diferenciado para permissão negada, indisponibilidade e origem HTTP insegura. Nova tentativa de GPS com menor precisão após erro de tempo/indisponibilidade. Origem manual permanece utilizável.
8. Um caminho HTTPS **opcional** na rede local: `bash iniciar-v2.sh --https`. Exige `mkcert` e instalar **apenas o certificado público da CA** no celular; não envia nada para serviço externo.

## Testar no Zorin

```bash
cd ~/Projetos/VANO/vano-react-v2
source ~/.nvm/nvm.sh
npm run test
npm run build
bash iniciar-v2.sh --rede
```

Local: `http://localhost:5174/inicio`. No celular: URL `http://IP_DO_ZORIN:5174/inicio` exibida no terminal. A porta no firewall fica restrita à sub-rede privada quando UFW está ativo.

### GPS no celular (HTTPS local opcional)

1. Instalar no Zorin: `sudo apt install -y mkcert libnss3-tools`.
2. Iniciar: `bash iniciar-v2.sh --https`.
3. Para localizar a CA pública: `mkcert -CAROOT`. Dentro do diretório, **copiar somente `rootCA.pem`** para o celular e instalá-lo como certificado de autoridade local em um aparelho confiável. **Nunca copiar `rootCA-key.pem`.**
4. Abrir `https://IP_DO_ZORIN:5174/inicio` pelo mesmo Wi‑Fi, validar o cadeado, permitir localização nas permissões do navegador e nas configurações do sistema.

**Atenção:** adicionar uma CA manualmente altera a confiança TLS do dispositivo; faça isso apenas em aparelhos próprios/de confiança e remova ao terminar os testes. Nem todo navegador aceita CAs instaladas pelo usuário. Se não puder instalar certificado, use a origem manual. A origem em `http://IP:5174` não pode solicitar geolocalização padrão do navegador com segurança.

## Importante

- Não inclui `.env`, `data/store.json`, `node_modules`, certificados ou tokens.
- Atualização do ZIP preserva banco e variáveis locais existentes.
- O algoritmo original de micro-rotas da V1 continua dependendo do backend original (`VANO_V1_API_URL`). A V2 sozinha não inventa resultados.
- Testes de código/API não substituem a validação do navegador em Android real.
