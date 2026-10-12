# VANO — Direção de interface local

Identidade fiel aos protótipos aprovados: laranja como acento de interação (nunca fundo completo permanente), mapa como protagonista, cartões somente quando houver tarefa, hierarquia de dados antes da decoração.

## Cores
- Ação e identidade `#FF5A0A`
- Grafite principal `#121829`
- Secundário `#687385`
- Superfície `#FFFFFF`
- Fundo de seções `#F5F6F8`
- Borda `#E7EAF0`
- Confirmativo `#178554` e aviso `#D68B12` como cores semânticas extras

## Tipografia
Manrope títulos, DM Sans corpo, fontes sistema como fallback. Todos os botões com área de toque >=44px e foco visível.

## Estrutura
```text
MAPA (sem destino)                  MAPA (com destino)
┌────────────────────────┐          ┌────────────────────────┐
│ marca           perfil │          │ origem / destino       │
│ [ buscar destino      ]│          ├────────────────────────┤
│ [Casa][Trabalho]...    │          │                        │
│                        │          │ MAPA COM ROTAS         │
│       MAPA             │          │                        │
│                        │          ├────────────────────────┤
│                        │          │ Mais segura            │
│                camadas │          │ Mais rápida            │
│                centrar │          │ [ Iniciar navegação ]  │
└────────────────────────┘          └────────────────────────┘

PERFIL
┌────────────────────────┐
│ Perfil            ⚙    │
│ [avatar nome] [resumo] │
│ Minha conta            │
│ Preferências           │
│ Lugares salvos         │
│ Segurança e privacidade│
│ Ajuda                  │
│ MAPA ROTAS ATIV PERFIL │
└────────────────────────┘
```

Microinterações: painéis deslizantes suaves, feedback de toque, chip selecionado evidente, reduz movimento quando `prefers-reduced-motion`.
