# VANO Maps V2 — branch de validação

Branch isolada criada a partir de `main`. O código legado permanece intacto.

**Status:** aguardando publicação da árvore React V2.7, que está no pacote local `VANO_V2_7_GitHub_Render_Staging.zip`. Não apontar Render para este commit enquanto a pasta `v2/` não existir.

Após publicação do código no diretório `v2/`, o build do serviço de prévia deverá ser:

- Repositório: `miguel027dev/vano`
- Branch: `preview/vano-react-v2-7`
- Build: `cd v2 && npm install --no-audit --no-fund && npm test && npm run build`
- Start: `cd v2 && npm start`
- `NODE_ENV=development` apenas para prévia com contas fictícias.
- `API_HOST=0.0.0.0`; `VANO_DEV_HTTPS=1`; Render injeta `PORT`.

Google OAuth na V2: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (callback **novo**, `https://<host-da-previa>/api/auth/google/callback`). Não colocar valores secretos no GitHub.

**Bloqueios para promoção:** armazenamento JSON efêmero no Render Free, migração real de contas, revisão de segurança e validação do OAuth/rotas. Nenhum merge para `main` até a aprovação.
