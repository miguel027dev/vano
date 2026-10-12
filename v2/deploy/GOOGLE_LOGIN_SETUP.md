# VANO V2 — Habilitação do cadastro e login Google (Render)

## Serviço correto
- Render, workspace **Miguel's workspace**, Web Service **vanu** (`srv-db67qjss728c73fg5amg`).
- App: `https://vanu-73xu.onrender.com`.
- Backend: `v2/server/index.mjs`, OAuth 2.0 Authorization Code + PKCE.
- O início do OAuth é encaminhado ao **host do callback configurado** antes de criar o cookie state. Para a configuração original restaurada, esse host é `vanomaps.online`.
- O Google requer um cliente OAuth do tipo **Web application** com redirect URI cadastrado exatamente.

## Etapas para ativação sem compartilhar segredos
1. No [Google Auth Platform/Google Cloud Console](https://console.cloud.google.com/apis/credentials), escolha o projeto proprietário do VANO.
2. Configure a **tela de consentimento OAuth** (nome, contato de suporte, domínios, usuários de teste, caso o projeto ainda esteja em modo de teste). Use somente escopos `openid email profile` para autenticação.
3. Crie ou atualize um cliente OAuth 2.0 do tipo **Aplicativo da Web**.
4. Confirme a origem JavaScript autorizada `https://vanomaps.online` (se necessária) e obrigatoriamente o URI de redirecionamento **original** `https://vanomaps.online/login/google/callback`.
5. No serviço `vanu` do Render, em **Environment**, cadastre diretamente — sem enviá-los em mensagens, logs ou GitHub:
   - `GOOGLE_CLIENT_ID` = identificador do cliente Web, terminando em `.apps.googleusercontent.com`.
   - `GOOGLE_CLIENT_SECRET` = segredo privado do mesmo cliente.
   - `GOOGLE_REDIRECT_URI` = `https://vanomaps.online/login/google/callback` (**callback original da V1, restaurado a pedido do proprietário**).
   - `VANO_PUBLIC_ORIGIN` = `https://vanu-73xu.onrender.com`.
6. Salve as configurações do Render e faça deploy/restart. Consulte `GET /api/health` para verificar `googleReady: true` e `googleIssue: null`; o endpoint **não retorna segredos**.
7. Teste com conta nova; depois faça logout e entre novamente. Valide Google no desktop e navegador Android, em aba normal e privada, sem desativar segurança do navegador.
8. Se o projeto estiver em modo de **Testing**, autorize os endereços de teste na tela de consentimento Google. Para acesso geral, cumpra o processo de publicação/verificação do Google.

## Mensagens de diagnóstico
- `credentials-missing`: `GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET` não foram preenchidos no serviço correto (ou ainda são placeholders).
- `invalid-client-id`: o ID do cliente não é do formato Web OAuth Google.
- `invalid-callback`: origem do callback não é HTTPS válida.
- `invalid-callback-path`: o callback deve usar `/api/auth/google/callback` (V2) ou `/login/google/callback` (V1 original).
- `redirect_uri_mismatch` (na tela do Google): URI no Google Cloud não corresponde exatamente ao URI configurado no Render.

**Importante:** o callback legado `/login/google/callback` agora também é aceito pela V2 para compatibilidade. Certifique-se de que `vanomaps.online` aponte para a versão que deve receber essa autenticação. Segredos OAuth não devem ser commitados.

## Dados de usuários
- A conta Google da V2 é criada e autenticada no armazenamento próprio da V2.
- **Ainda não houve migração dos dados da V1 para a V2.** Usuários V1 não aparecem automaticamente na V2.
- Este serviço V2 permanece com armazenamento JSON temporário, inadequado para contas de clientes em produção. Configure armazenamento transacional persistente antes do lançamento público.
- O único Postgres visível em **Miguel's workspace** na inspeção de 12/10/2026 é **`tyvon-db`** (`dpg-dautk4h7lnhs739tj800-a`), vinculado ao TYVON. **Não** use esse banco para o VANO sem isolamento e migração aprovados. Nenhum Postgres foi listado no workspace antigo VANO; a V1 pode utilizar um banco externo.
