# VANO React V2 — primeira entrega técnica (preview, não produção)

## Implementado

1. Controller único de câmera no Mapbox (sem duas rotinas competindo por `easeTo` / `jumpTo`): estados IDLE, PREVIEW, FOLLOWING, MANEUVER_FOCUS, FREE_LOOK, RECENTERING, REROUTING e ARRIVAL, com suavização baseada em delta de tempo real.
2. Ajustes de zoom e pitch conforme movimento (GPS speed, heading, accuracy), curvas, destino próximo e preferência por movimento reduzido; câmera fixa quando usuário arrasta, retorno pelo botão de localização; alternância livre 2D/3D.
3. Tratamento de estilo Mapbox: **sem `getStyle()` prematuro**; pintura somente quando o estilo terminou de carregar; layers persistentes e pequenos efeitos de transição.
4. Rotas visuais de VANO laranja e alternativas cinza; preview `fitBounds` sem competição com câmera de navegação.
5. Recalcular rota somente após afastamento GPS consistente >75 m durante 2,2 s com precisão <=50 m; cooldown mínimo 25 s. Isso é heurística de preview, sujeita a validação em campo.
6. Ponte de backend `server/v1-bridge.mjs` preparada para **usar o motor original** `/api/route` em modos `safest` e `fastest`. Normaliza geometrias, unidades, manobras e metadados `micro_route`, `eta_gain_s`, `micro_strategy`.
7. Quando não há URL da V1 configurada, o backend usa Mapbox Directions e rotula explicitamente que **não são micro-rotas V1**. Falhas com token Mapbox não são substituídas silenciosamente por rotas fictícias.
8. Error Boundary: um erro de interface não resulta mais intencionalmente em página inteiramente vazia.
9. Cadastro local por e-mail/senha anterior preservado; confirmação de senha e passagem ao onboarding após criação de conta. Google ainda desabilitado enquanto OAuth não configurado.
10. Preserva navegação, páginas, preferências, dados locais de teste, e identidade visual da primeira prévia.

## Não implementado / limites

- **A lógica Python original não foi reescrita, copiada ou executada neste ZIP.** Ela só é utilizada quando você define `VANO_V1_API_URL` para um backend V1 válido. O projeto local não ganha micro-rotas reais automaticamente ao preencher só a chave Mapbox.
- O status de trânsito e segurança só é confiável na medida permitida pelos dados/provedor. Nunca considere o modo seguro como garantia de segurança.
- Sem OAuth Google, recuperação de e-mail, verificação de conta, moderação, auditoria de produção, CI Android ou mapa 3D de edifícios com oclusão real.
- Sem teste visual completo no browser nem `npm run build` aqui porque dependências npm não estavam disponíveis na execução de geração; sintaxe JSX verificada pelo parser TypeScript; 11 testes de Node passaram.
- Este pacote nunca deve substituir a versão publicada antes de testes reais de câmera, GPS, rotas e dispositivos.

## Como executar isoladamente no Zorin

O novo app usa `http://localhost:5174` para o React e porta 8878 para a API, sem interromper a versão antiga em 5173/8787.

```bash
cd ~/Downloads
unzip -o VANO_React_V2_Preview.zip -d ~/Projetos/VANO/
cd ~/Projetos/VANO/vano-react-v2
bash iniciar-v2.sh
```

O script importa apenas o token **público** Mapbox `pk.*` de `~/Projetos/VANO/vano-react-local/.env`, se existir e se V2 estiver sem token. Não importa segredos. Nunca envie tokens privados por chat.

Para usar **micro-rotas V1**: defina `VANO_V1_API_URL=https://SEU_BACKEND_V1` em `.env`, sem barra final. O backend precisa responder a `/api/route` com geometrias e rotas e permitir acesso da V2 (rate-limit/guest auth podem impedir). Quando configurado e indisponível, a V2 mostra erro em vez de mascarar com cálculos fictícios.

```bash
npm test
npm run build
```

Valide manualmente: abrir o mapa, procurar destino, preview, duas opções, start, drag/recente, 2D/3D, retorno da aba em segundo plano, mudança de tema, estilo satélite, GPS impreciso, desvios, login/cadastro e componentes responsivos.

## Próximas fases

- Testes reais em browser + ajustes de render de memória/mapa.
- Coleta e instrumentação de telemetria de câmera opcional, sem rastreamento persistente exato.
- Comparador API V1 vs V2 por 10 pares urbanos e condições de pico.
- Edifícios 3D com oclusão, Android/WebView, login Google, criação de conta de produção e refinamento de UI.

## V2.1 — acesso sem GPS (hotfix)
- Tratamento explícito de erro de permissão, timeout e contexto HTTP não seguro.
- Não há mais posicionamento presumido do usuário em São Paulo em solicitações de rota.
- Se o GPS falhar, aparece opção **Escolher origem no mapa** e botão para tentar novamente.
- Com origem manual, é possível pesquisar destino, calcular a rota e visualizar o trajeto sem autorização de GPS.
- Navegação guiada ao vivo permanece reservada ao GPS real: não inventar movimentação nem posição.
- Funciona tanto no mapa Mapbox como no fallback Leaflet/OpenStreetMap.
