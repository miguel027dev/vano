# VANO Maps V2.4 · Atlas

**Escopo:** redesign da primeira impressão e do perfil, atualização da linguagem dos componentes, refinamento do mapa e preparação de teste em rede. O algoritmo original de micro-rotas da V1 não foi substituído nem declarado conectado sem uma API funcional.

## Diagnóstico e objetivo

A V2.3 apresentava pelo menos três estilos visuais concorrentes: tela de entrada editorial, onboarding ilustrado de fundo claro e perfil com cartão escuro de grande peso visual. A hierarquia do perfil priorizava um bloco estético em vez das informações reais. O Atlas unifica o produto: páginas leves, tipografia forte, informação contextual, cores com propósito, transições sem excesso de movimento.

## Identidade e direção artística

- **Marca:** logo VANO laranja e seta branca **já fornecido pelo usuário e presente na biblioteca**, sem substituir o símbolo. Caminho: `public/vano-logo-original.webp`.
- **Cores:** papel `#FAFAF8`, giz `#FFFFFF`, areia `#F7F5F0`, tinta `#202622`, cinza `#788078`, linha `#E8E8E2`, marca `#E95B22`, fundo de marca `#FFF0E7`.
- **Tipo:** Inter, com fallback para system-ui. Headlines grandes, peso 740–780 e tracking negativo. Legendas pequenas e metadados em caps equilibrados.
- **Elementos gráficos:** uma malha de ruas simplificada em SVG com rota laranja (`public/vano-city-lines.svg`) e outro traço vetorial (`public/vano-trip-line.svg`) no cartão de preferências. Sem mapa fake com ETA inventado.
- **Imagem do veículo:** os assets aprovados `vehicle-car.webp` e `vehicle-moto.webp` reaproveitados no onboarding e no perfil.
- **Densidade:** nada de gradientes de marketing excessivos, cartões pretos ou efeitos de vidro em toda a interface.

## Arquitetura de telas

### 1. Boas-vindas `/inicio`

- Marca original à esquerda e CTA de login simples à direita.
- Headline **“O melhor caminho é o seu.”** com destaque laranja em poucas palavras.
- Uma descrição em linguagem cotidiana e duas ações principais: começar e entrar.
- “Explorar mapa como visitante” visível, sem exigir conta para explorar.
- Peça cartográfica pequena à direita (desktop) ou abaixo dos CTAs (celular), com duas escolhas de rota e **sem números fictícios**.
- Para telas muito estreitas a peça é removida antes que atrapalhe as ações.

Wireframe mobile:

```text
┌─────────────────────────┐
│ VANO               Entrar│
│                         │
│ UMA NOVA FORMA DE CHEGAR│
│                         │
│ O melhor caminho        │
│ é o seu.                │
│                         │
│ Vá além da rota óbvia...│
│                         │
│ [   Começar agora    → ]│
│ [   Já tenho conta     ]│
│ Explorar como visitante │
│                         │
│ ┌  Peça de rota        ┐│
│ └──────────────────────┘│
│ Privacidade       Termos│
└─────────────────────────┘
```

### 2. Login `/entrar` e cadastro `/cadastro`

- Uma única coluna no celular e editorial secundário no desktop.
- Campos com mínimo 52–56 px de altura, foco suave e show/hide senha.
- Erros próximos ao formulário, nada de pop-ups modais ou telas bloqueantes.
- Sem botão Google falso; OAuth deverá ser implementado no backend posteriormente.
- Entrar não dispara o onboarding para usuário que já concluiu a personalização.

### 3. Personalização `/personalizar`

- **Preservar estrutura aprovada:** escolha visual entre carro e moto, rota rápida/segura, atividades/rotinas.
- Imagens aprovadas reutilizadas; evitar redesenhar os veículos desnecessariamente.

### 4. Perfil `/perfil`

- Remover totalmente o cartão hero preto e o laranja sobre preto.
- Identidade em linha superior, avatar simples e dados da conta.
- Métricas com divisórias finas: rotas iniciadas, distância **estimada** planejada, lugares salvos. Não chamar esse número de quilometragem real percorrida.
- Cartão **“Seu jeito de navegar”** claro com ilustração do veículo, link para preferências.
- Atalhos reais para destinos favoritos com link correto para `/mapa?destination=...`.
- Lista de preferências e até duas rotas recentes, sem dados fictícios.
- Rodapé com status discreto da integração V1.
- Estados especiais: visitante, vazio, carregamento, histórico disponível.

Wireframe mobile:

```text
┌─────────────────────────┐
│ VANO               ⚙︎    │
│                         │
│ [AV]  Olá, visitante. ↗ │
│       e-mail / condição │
│                         │
│ ROTAS     DIST.   LUGARES│
│   0        0 km      0  │
│ ─────────────────────── │
│ ┌ Seu jeito de navegar ┐│
│ │ Carro · Mais segura  ││
│ │ Ajustar →       [🚘] ││
│ └──────────────────────┘│
│                         │
│ Para onde vamos?        │
│ [+ Adicionar lugar]     │
│                         │
│ Sua experiência         │
│ Conta  Config.  Privacy │
│                         │
│ Seus trajetos           │
│ Histórico real / vazio │
│                         │
│ Mapa  Rotas  Ativ. Perfil│
└─────────────────────────┘
```

### 5. Mapa e outras telas

- Preservar cálculos e estados de câmera V2.3. Refinar bordas, densidade de chips, contraste dos cartões e estados de pressionar/foco.
- Ajustar link de favoritos em “Suas rotas” para `/mapa` (não a rota `/` que redirecionava).
- Continuar oferecendo origem manual quando o navegador negar GPS.
- O modo **Mais segura** só pode declarar segurança verificada quando existir dado real; fallback Mapbox não recebe selo de segurança comprovada.

## Motion system

| Evento | Direção | Duração alvo |
|---|---|---|
| Carregamento da primeira interface | opacity + deslocamento 18px | ~650 ms |
| Entrada da peça cartográfica | opacity + escala 0,985 | ~700 ms |
| Navegação de páginas de conteúdo | opacity + 18px | ~330 ms |
| Hover e foco de ações | 2px de elevação e mudança de fundo | ~200 ms |
| Toque de botão | escala 0,985 | imediato |
| Veículo no perfil | leve elevação e rotação menor | ~450 ms |
| Formulário | borda + highlight sem troca de layout | ~200 ms |
| Mapa e GPS | preservar motion controller V2 existente | baseado em dados reais |

Todas as animações aqui respeitam `prefers-reduced-motion`. Os componentes críticos continuam usáveis sem efeitos visuais. Sem scroll-jacking, sem loops decorativos, sem animação que bloqueie clique.

## Responsividade e segurança

- Breakpoints: <=360, <=600, <=800, <=970, >=1110 px.
- `viewport-fit=cover` e respeito a `safe-area-inset-bottom` em CTA e navegação.
- A Vite está em `0.0.0.0:5174`: permite acesso no mesmo Wi-Fi, com firewall restrito opcional ao segmento local.
- Em rede via `http://IP:5174`, navegador mobile pode bloquear geolocalização por não ser HTTPS. A origem manual permanece disponível. **Não prometer GPS nem login seguro em HTTP público.**
- Banco local do Node e tokens preservados na atualização; nenhum `.env` nem `data/store.json` incluídos no ZIP.
- Usar contas de teste na rede local, sem senhas reais. Produção exige TLS, banco de dados apropriado e controles de autenticação auditados.

## Testes previstos / gate de aprovação

1. API + 13 testes automatizados do pacote (regressão).
2. Verificação estática de sintaxe React/JS e CSS.
3. `npm run build` no ambiente com dependências disponíveis.
4. Teste visual 360×780 e desktop >=1280; validação em dispositivo físico.
5. Verificação do acesso `http://IP-LOCAL:5174/inicio` por celular no mesmo Wi-Fi.
6. Confirmar que `.env`, contas e favoritos da instalação atual permaneceram após atualização.

**V2.4 é preview de design.** O bridge Python V1 depende de configuração/autorizações e continua separado da versão publicada.
