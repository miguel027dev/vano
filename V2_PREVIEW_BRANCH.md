# VANO React V2.7 — preview branch

A aplicação React V2.7 está publicada em `v2/` desta branch, incluindo o backend Node de staging, o login Google por OAuth Authorization Code + PKCE, assets, testes e guia de deployment. Código Python V1 na raiz preservado.

- Branch: `preview/vano-react-v2-7` (NÃO é `main`).
- Projeto: `v2/`.
- Build: `cd v2 && npm install --no-audit --no-fund && npm test && npm run build`.
- Start staging: `cd v2 && npm start`.
- Guia: `v2/RENDER_STAGING_V2.md`.
- Variáveis Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (o callback precisa apontar para o host novo da prévia).
- Não são compartilhados segredos nem sessões com a V1.

**Atenção:** a API usa JSON single-instance. Render Free tem disco efêmero, portanto o serviço de preview não pode ser tratado como produção com usuários reais. O Render staging deve ser um NOVO serviço com branch da V2; não trocar a branch do serviço V1 até a aprovação.
