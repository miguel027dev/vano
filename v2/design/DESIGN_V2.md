# VANO V2 — Frontend Design / Arrival & Identity

## Produto e linguagem visual
- **Assunto:** navegação urbana brasileira com descoberta de caminhos melhores e preservação da marca VANO.
- **Público:** pessoas que dirigem carro ou moto e querem entrar rapidamente, escolher seu trajeto e guardar preferências.
- **Trabalho da interface:** do primeiro acesso ao primeiro percurso com o mínimo de etapas.
- **Identidade:** sinalização urbana redesenhada como visual digital — linhas vivas de rota, navy de pavimento ao anoitecer, superfícies claras e laranja de decisão.

## Paleta e tipografia
- #101D2A Ink: headlines, navegação e superfícies profundas
- #FF640C Signal: marca, CTA e rota em destaque
- #F5F6F3 Fog: telas de chegada e onboarding
- #CDD8D2 Sage: malha urbana desenhada e detalhes
- #FFFFFF Chalk: cartão e contraste
- #697780 Slate: textos auxiliares
- **Manrope**: headlines e números. **DM Sans**: corpo e formulários. Fallback nativo em caso de rede indisponível.

## Wireframes

### Entrada desktop
```
┌───────────────────────────────────────────────────────────┐
│ VANO          • Seu próximo caminho               Entrar ↗│
├─────────────────────────────┬─────────────────────────────┤
│ NOVO VANO EXPERIENCE        │     mapa cartográfico       │
│ O trânsito muda.            │       com linha laranja     │
│ Seu caminho também.         │        ▲ marcador           │
│                             │                             │
│ [Criar minha conta →]        │    ┌──────────────────┐    │
│ [Explorar o mapa ↗]         │    │ caminho melhor   │    │
└─────────────────────────────┴─────────────────────────────┘
```

### Autenticação
```
┌────────────────┬───────────────────────────────────┐
│  Identidade    │ Entrar / Criar conta              │
│  mapa e marca  │ nome? / email / senha / confirmar │
│                │ [ CTA ]                          │
│  texto curto   │ Google OAuth — pendente           │
└────────────────┴───────────────────────────────────┘
```

### Personalização
```
┌─────────────────────────────────────────────────────────┐
│ VANO                  01 / 03                        │
│ ▰▱▱                                                     │
│ Como você se move?                                      │
│ ┌────────────────────┐  ┌────────────────────┐          │
│ │     CARRO IMG      │  │      MOTO IMG      │          │
│ │ ○ Carro            │  │ ○ Moto             │          │
│ └────────────────────┘  └────────────────────┘          │
│ Voltar                                   Continuar →     │
└─────────────────────────────────────────────────────────┘
```

## Crítica e ajustes antes da implementação
- **Não** reutilizar tab cards e formulários espremidos da V2 anterior: cada intenção tem rota e hierarquia próprias.
- **Não** esconder o mapa atrás da permissão de GPS: visita sem conta e origem manual disponíveis.
- **Não** divulgar que Mapbox básico tem motor de micro-rotas: a interface indica quando a API da V1 está conectada.
- **Não** substituir a marca: aproveitar o símbolo atual e o wordmark VANO na interface.
- **Não** simular Google OAuth: botão inacessível até haver Client ID + secret válido no backend.
- **Acessibilidade:** foco visível, seleção com `aria-pressed`, erros associados a region alert, labels de campos, movimento reduzido.
- **Motion:** rotas desenhadas discretamente, botões respondem de imediato e formulários não usam transição de layout longa.

## Validação
1. Primeiro acesso: apresentação e botão explorar.
2. Cadastro: erro por campo, confirmação, criação persistida.
3. Login: sessão sobrevivendo recarga, rejeição de senha incorreta.
4. Onboarding: carro/moto, preferência de rota, temas de rotina e persistência.
5. Perfil: alterações de conta, estatísticas, favoritos, sair, exclusão.
6. Rotas: Mapbox real como fallback rotulado; bridge V1 em `VANO_V1_API_URL` para o motor original.
7. Desktop, Android/web, dimensões 320–1440 px, dark, reduced motion.
