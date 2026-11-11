# VANO Atlas Light — estilo de navegação Mapbox

O novo estilo tem fundo #F6F7F5, água #DCECF4, vegetação #E6F1E7, vias brancas com contorno discreto e rótulos legíveis. A rota laranja (#E95B22) e a seta do usuário são desenhadas dinamicamente pelo aplicativo, sobre a cartografia.

## Usar no Mapbox Studio

1. Abra o Mapbox Studio, área **Styles**, e importe `vano-atlas-light.json` usando a opção de importação de JSON da interface.
2. Teste os rótulos e as ruas em diferentes cidades; publique o estilo.
3. Copie a URL `mapbox://styles/USUARIO/ID-DO-ESTILO`.
4. No Render, defina `VITE_MAPBOX_STYLE_URL` com essa URL e faça novo build. O token continua em `VITE_MAPBOX_PUBLIC_TOKEN` (chave pública `pk.*`).
5. O botão de camadas mantém o satélite Mapbox independente desse estilo.

O arquivo já é servido pelo app em `/mapbox/vano-atlas-light.json` quando a variável opcional não é configurada. Nunca coloque chaves `sk.*` no frontend.

Nota: esta é a cartografia-base; o GPS, a câmera, as rotas e suas animações continuam sendo funções separadas no React/Mapbox GL JS.
