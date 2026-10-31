# MAVI Gemini Live — laboratório V2 (administrador)

Status: experimental, feature flag desligada por padrão. A integração não altera o mapa / nem a MAVI atual. As mudanças ficam em branch/PR até que sejam revisadas.

## Configuração do serviço no Render

1. Use uma conta/projeto Google **elegível pelas regras de idade e uso do fornecedor**, devidamente autorizado a consumir a API.
2. Configure `GEMINI_API_KEY` como variável secreta no serviço de backend correspondente ao repositório.
3. Configure `VANO_GEMINI_LIVE_V2_ENABLED=1` somente depois de validar custo, cotas, credenciais e autorização.
4. Acesse `/v2` autenticado como administrador e abra o botão `MAVI Live` no canto inferior direito.
5. Autorize o microfone, escolha o modelo e clique em `Iniciar conversa`; use `Encerrar` quando terminar.

O laboratório não usa um proxy contínuo no Render: o servidor emite um token efêmero de uso único via `POST /api/admin/gemini-live/session` após checagem de administrador, CSRF e rate limit. O navegador estabelece o WebSocket diretamente com o Google. O token e a chave nunca devem ser gravados em logs ou analytics.

### Funcionalidade disponível

- Áudio contínuo PCM16 16 kHz para a Live API e reprodução 24 kHz do áudio retornado.
- Detecção automática de voz pelo Gemini (VAD), interrupção de resposta e controle para silenciar/encerrar.
- Transcrição mostrada somente enquanto a página está aberta; sem persistência de áudio/transcrição no VANO.
- Três opções de modelos ao vivo e seleção de voz.
- Function calling experimental `get_vano_map_context`, **somente leitura**, com dados visíveis da interface. Nenhuma ferramenta possui autorização para alterar rota, enviar SOS ou mudar preferências.
- Desconexão ao ocultar a aba e ao fechar a página.

### Limitações antes de produção

- Testar de ponta a ponta com credencial elegível e cotas reais, em navegador desktop e Android, verificando suporte a AudioWorklet, microfone, Wi-Fi/4G e CSP.
- O teste não implementa hotword local confiável nem confirma/troca rotas por voz; essas funções exigem integração adicional ao motor existente e revisões de segurança.
- A duração de sessão é limitada por token e modelo; reiniciar manualmente a sessão para testar.
- Se `VANO_PERMISSIONS_POLICY` estiver customizada para bloquear microfone, a permissão deverá ser revisada separadamente para a V2; não altere a política global de páginas públicas.
- Uma conta com modalidade gratuita pode ter cotas pequenas e os dados enviados ao fornecedor podem ser usados para aprimoramento dos produtos, conforme as condições da conta.
- A Live API e os tokens efêmeros podem mudar por estarem em preview. Verifique a documentação oficial antes de produção.

### Arquivos

- `vano/services/gemini_live_v2.py`: token efêmero e gate admin
- `static/vano-gemini-live-v2.js`: cliente bidirecional e interface de laboratório
- `static/vano-gemini-pcm-worklet.js`: áudio do microfone
- `static/vano-gemini-live-v2.css`: painel isolado
- `static/vano-v2.js`: carregador admin-only
- `vano/security/headers.py`: CSP de WebSocket restrito à V2
- `tests/test_gemini_live_v2.py`: isolamento e autorização

Documentação do provedor:
- https://ai.google.dev/gemini-api/docs/live-api
- https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket
- https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
