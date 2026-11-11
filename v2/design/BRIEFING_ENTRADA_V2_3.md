# VANO Maps V2.3 — Briefing de entrada / acesso

## Papel do trabalho
Refinar apenas a entrada, login, cadastro e aplicação da marca — sem transformar em landing page de agência de mapas. A seleção ilustrada de carro/moto do onboarding fica preservada; mapas, rotas, perfis, backend e dados permanecem os da V2.2.

## Conceito e direção de arte
**"Seu caminho. Sua escolha."** Uma interface com postura calma e confiante, desenhada primeiro para a tela do celular. O valor do VANO é a escolha de caminhos: a comunicação deve chegar ao ponto em poucos segundos, não competir com a navegação.

### Paleta (5 cores)
- Canvas quente `#FAF9F7` — superfície editorial de boas-vindas
- Papel `#FFFFFF` — superfície de formulários
- Laranja VANO `#E95B22` — CTA, foco e acento; deriva da marca laranja original
- Texto profundo `#202421` — hierarquia e legibilidade
- Neutro `#737873` — textos complementares

A logo **não é recriada**: o ícone laranja/seta branca vem do arquivo de marca presente na Biblioteca do usuário (`Glossy Orange Road Arrow Icon.png`), convertido para WebP de 256×256 somente para otimização do navegador. O wordmark VANO / MAPS acompanha a marca na mesma composição do material de referência da Biblioteca.

### Tipografia
Inter e tipografia nativa como primeira intenção no fluxo novo, com `font-weight: 790`, tracking editorial negativo em títulos e corpo entre 16–19px; sem dependência de fontes de arquivos repassados pelo usuário. O CSS legado continua carregando DM Sans/Manrope para as telas antigas.

## Telas e wireframes
### Boas-vindas — mobile
```text
┌──────────────────────────────┐
│ [marca VANO]          Entrar↗│
│                              │
│                              │
│ ─ O SEU NOVO CAMINHO        │
│                              │
│ Seu caminho.                 │
│ Sua escolha.                 │
│                              │
│ Mais rápida ou mais segura?  │
│ Encontre a melhor rota...    │
│                              │
│ [   Começar agora     →   ]  │
│ [   Já tenho uma conta   ]   │
│                              │
│ Conhecer mapa sem conta    ↗ │
│                              │
│ © VANO             Privacidade│
└──────────────────────────────┘
```
**Sem mapa animado gigante.** Um pequeno carimbo de trajeto estático só aparece na versão desktop, como detalhe editorial de navegação, e não como funcionalidade fictícia.

### Login / cadastro — mobile
```text
┌──────────────────────────────┐
│ [marca VANO]         ← Voltar│
│                              │
│ ─ CONTA VANO                 │
│ Bom ter você de volta.       │
│ Frase curta de apoio.        │
│                              │
│ Entrar       Criar conta     │
│ ──────────                   │
│                              │
│ E-mail                       │
│ [seu@email.com           ]   │
│ Senha                        │
│ [••••••••                 👁]  │
│                              │
│ [ Entrar                 → ]  │
│                              │
│ Primeira vez? Criar conta  ↗ │
│ Explorar sem conta         → │
│                              │
│ Termos • Política            │
└──────────────────────────────┘
```
O cadastro acrescenta nome e confirmação de senha, sem campos adicionais desnecessários. Os erros aparecem junto ao formulário e mensagens de carregamento são explícitas. O botão Google foi removido do fluxo visual até haver OAuth real.

## Motion e microinterações
- **Splash**: marca e wordmark, até 620ms, apenas uma vez por aba; não bloqueia carregamentos nem a interação; desativado em `prefers-reduced-motion`.
- **Entrada**: conteúdo fade/translateY discreto de ~560ms, sem grande ilustração animada ou parallax.
- **Login/cadastro**: entrada leve de ~460ms; alternância de abas sublinhada em ~240ms.
- **Campos**: focus ring com cor da marca e transição de ~200ms; botões de senha apresentam estado acessível `aria-pressed`.
- **Botão primário**: leve elevação ao hover, leve compressão em `:active`; carregamento com spinner apenas durante requisição.
- **Erros**: fade curto sem sacudir formulários.
- **Preferência de movimento reduzido**: retira animações não essenciais.

## Responsividade e acessibilidade
- Mobile: sem painel lateral; alvos acima de 40px, campos com fonte mínima 16px para evitar zoom no iOS, formulário com rolagem natural.
- Desktop: painel editorial estático lateral, sem capturar atenção.
- Suporte aos safe areas (`env(safe-area-inset-bottom)`), orientação vertical e telas com altura reduzida.
- Foco visível, labels reais, feedback com `role=alert`, estado de loading e HTML semântico; sem geolocalização obrigatória na entrada.
- Não copiar transições ou layout proprietários do Waze/Apple Maps; trabalhar a linguagem própria da VANO.

## Limites e checklist
- Preservar `OnboardingPage`, as imagens `vehicle-car.webp`/`vehicle-moto.webp`, `server/`, `src/lib/`, `context.jsx`, regras V1 e `.env` da instalação atual.
- Não publicar ou configurar credenciais Google nesta entrega.
- Não incluir `.env`, `data/store.json`, caches, dependências ou chaves no ZIP.
- Validar 13 testes Node, sintaxe JSX e análise sintática de CSS. Validar build e visual no Zorin após a instalação — indisponível neste ambiente sem registro npm.
