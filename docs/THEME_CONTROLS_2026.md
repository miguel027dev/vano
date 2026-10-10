# Temas claro e Black — inventário e validação

## Inventário completo dos controles

| Tela/posição | Identificação preservada | Variante | Ícone compartilhado |
|---|---|---|---|
| Cabeçalho das páginas, inclusive administração | `globalThemeToggle` | Botão de ícone | `_theme_icon.html` |
| Login | `startup-theme` | Botão de ícone | `_theme_icon.html` |
| Personalização inicial | `ob-theme-v402 ob500-theme` | Botão de ícone | `_theme_icon.html` |
| Controles rápidos do mapa | `mapThemeBtn` | Botão de ícone | `_theme_icon.html` |
| Menu da conta no mapa | `drawer-theme-toggle` | Linha com texto | `_theme_icon.html` |
| Menu de visitante no mapa | `guest-theme-toggle` | Linha com texto | `_theme_icon.html` |
| Preferências do perfil | `profile353-theme-action` | Linha com estado | `_theme_icon.html` |

A busca em todos os templates encontrou sete controles. Nenhum template contém
botões `data-vano-theme-option`; o suporte do controlador a futuras opções foi mantido.
Todos continuam sendo botões nativos, com acionamento por teclado, `aria-pressed`,
nome acessível estável, indicação de foco e área mínima de 44 px.

## Comportamento e animação

O mesmo SVG mostra o sol no claro e a lua com estrelas no Black. As partes giram,
mudam de escala e opacidade em até 460 ms. Não há loop, temporizador de animação,
dependência de Lucide para esse ícone ou transição aplicada à página inteira.
`prefers-reduced-motion` elimina a animação. O CSS integra a folha compartilhada
existente e usa uma camada anterior às regras legadas para uniformizar variantes.

Uma única preferência, `vano.theme.mode.v200`, é lida antes da primeira pintura em
`base`, `login`, `shared_route` e `live_trip`. Templates que herdam `base` recebem a
mesma inicialização. Chaves antigas válidas são migradas no próximo acionamento.
A preferência também sincroniza entre abas, ao limpar armazenamento e ao voltar
por histórico. Se o armazenamento estiver bloqueado, a escolha vale na página
atual; não é possível garantir persistência entre páginas nesse caso.

O mapa principal e o fallback respeitam o tema salvo mesmo após atualizações de
clima. Horário e overrides antigos deixam de trocar as cores por conta própria.
As opções de estilo do perfil continuam salvas; o tema escolhido determina a
paleta claro/escuro do mapa. Trocar o mapa ainda pode exigir carregar recursos do
Mapbox: a duração do ícone não é uma medição de desempenho do mapa.

## Cobertura das telas

| Família | Inicialização | Cores |
|---|---|---|
| Mapa, planejador, menus e navegação | `base` + controlador | Paleta global e estilo Mapbox correspondente |
| Login | Inicialização compartilhada + controlador | Tokens de autenticação ligados à paleta global |
| Cadastro, recuperação de senha e redefinição | Herdam `base` | Fundação e estilos de autenticação |
| Personalização inicial | Herda `base` | Tokens `--ob-*` com variante Black existente |
| Perfil, alertas, denúncias, notificações e convites | Herdam `base` | Fundação e tokens de perfil |
| Páginas públicas, ajuda, termos, privacidade e exclusão | Herdam `base` | Superfícies, textos, formulários e menus da fundação |
| Acesso ao aplicativo, beta, contato e imprensa | Herdam `base` | Fundação; tokens de acesso ligados à paleta global |
| Administração e detalhes | Herdam `base` | Fundação e estilos administrativos existentes |
| Rota compartilhada e trajeto ao vivo | Inicialização compartilhada + controlador | Variantes próprias claro/Black; mapa lê o tema antes de abrir |

Black usa fundo `#0a0a0b`, cartões `#18181b` e texto `#f7f7f8`.
Claro usa fundo `#fff8f2`, cartões `#fff` e texto `#27231f`.
As cores semânticas de avisos e as prévias de estilos de mapa permanecem distintas.

## Validação

- 144 testes locais passaram; três integrações PostgreSQL dependem do banco de CI.
- Testes executam o controlador e a inicialização reais em Node: sete controles,
  ambos os temas, primeira pintura, navegação, migração, sincronização, histórico,
  limpeza de dados, acessibilidade e armazenamento bloqueado.
- Regressão executa os dois resolvedores de tema do mapa com clima noturno,
  chuva, estilo noturno salvo e overrides incompatíveis.
- JavaScript alterado passou pela verificação de sintaxe; `git diff --check` limpo.
- Todos os templates foram compilados pela suíte e todos os sete controles foram
  auditados para uso do componente comum.

Revisar visualmente a versão publicada é uma etapa adicional. A cobertura de
código acima não substitui conferir cada estado de tela em aparelhos físicos,
Safari ou páginas privadas que exigem sessão autenticada.
