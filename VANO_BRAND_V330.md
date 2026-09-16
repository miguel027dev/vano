# VANO MAPS — Brand System V330

Atualização visual baseada no material de branding e no novo ícone fornecido.

## Identidade
- Ícone principal substituído em 64, 192 e 512 px, além do asset mestre `vano-brand-icon-v330.png`.
- Wordmarks claro e escuro refeitos em `vano-maps-banner.png` e `vano-maps-banner-dark.png`.
- Paleta canônica: Deep Orange-Red `#FF3D00`, Bright Orange `#FF7A00`, Soft Orange `#FFA552`, Warm Amber `#FFD280` e Ivory/Cream `#FFF7ED`.
- Novo stylesheet de autoridade visual: `static/vano-brand-v330.css`, carregado por último para harmonizar páginas legadas sem reescrever a lógica delas.
- Favicon, PWA, atalhos, splash, cabeçalhos e superfícies standalone usam a identidade nova.

## Responsividade
- Celular: preserva o fluxo bottom-sheet e aumenta consistência de touch targets, cards e controles.
- Tablet (>= 768 px): planner vira painel lateral, ações e drawers deixam de competir com o mapa e cards ganham grade mais estável.
- Desktop (>= 1180 px): planner lateral de 448–470 px, HUD de navegação reposicionado, ferramentas do mapa e painéis com margens próprias, maior densidade de serviços.
- Login, rota compartilhada, acompanhamento ao vivo e páginas gerais receberam layouts específicos para tablet/desktop.

## Tema e consistência
- Light mode usa superfícies marfim/creme e contraste quente.
- Black mode usa superfícies quase pretas e laranja controlado para foco/ação.
- Botões primários, inputs, cards, estados de foco, ícones Lucide, menus e componentes administrativos seguem a mesma linguagem.
- Cores antigas salmão/marrom foram normalizadas para a paleta do branding nas folhas e assets legados relevantes.

## Cache/PWA
- Build padrão atualizado para `330.0.0`.
- Service worker atualizado para cache `vano-maps-v330` e precache da nova folha de branding, UI e banners.
- Manifest atualizado para `#FFF7ED` / `#FF7A00`.

## Verificações realizadas
- `python -m py_compile` nos módulos Python principais.
- Parse dos 35 templates Jinja (filtro customizado `brl` simulado apenas durante a validação sintática).
- Parse CSS com `tinycss2`: sem erro de sintaxe no stylesheet V330.
- `node --check` no service worker V330.
