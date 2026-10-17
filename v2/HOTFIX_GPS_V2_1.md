# VANO V2.1 — Hotfix GPS

## O que muda
- Navegação e consulta de rotas não ficam bloqueadas pela permissão do navegador.
- Identifica erro de permissão negada, demora na obtenção da posição e HTTP sem origem segura.
- Botão "Escolher origem no mapa" permite definir de onde a rota parte sem usar GPS.
- Ao escolher um destino sem GPS, pede a origem antes de calcular.
- Nenhuma coordenada inventada como posição atual: localização desconhecida não é São Paulo.
- "Tentar novamente" solicita o GPS por um gesto do usuário.
- Prévia de rota está disponível sem GPS. A orientação ao vivo continua exigindo localização real.
- Mesma seleção por clique em mapa Mapbox ou fallback Leaflet.

## Aplicação no Zorin
Parar V2 no terminal com Ctrl+C. Extrair o ZIP de correção diretamente no diretório `~/Projetos/VANO/vano-react-v2/`. Rodar `bash iniciar-v2.sh`. Abrir `http://localhost:5174/` e atualizar com Ctrl+Shift+R.

O ZIP de correção contém somente arquivos em `src/` e este arquivo. Não substitui `.env`, dados de conta, nem outros projetos. A V1 principal permanece inalterada.
