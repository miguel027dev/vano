# VANO Maps React V2.7 — branch isolada / staging Render

Branch: `preview/vano-react-v2-7` (branch baseada na `main` original).

## Objetivo

Prévia **isolada** para avaliação. Não altera `vanomaps.online`, os serviços antigos nem o banco de dados original.

## Deploy manual do staging no Render

Criar **NOVO** Web Service (não editar o serviço da V1):
- Repository: `https://github.com/miguel027dev/vano`
- Branch: `preview/vano-react-v2-7`
- Runtime: Node.js (22.18+)
- Build Command: `cd v2 && npm install --no-audit --no-fund && npm run test && npm run build`
- Start Command: `cd v2 && npm start`
- Plan: Free (somente TESTES — dados em disco efêmero desaparecem nos redeploys) ou plano com disco persistente e instância única se autorizado.
- Health check: `/api/health`

### Variáveis de ambiente obrigatórias na prévia

```env
NODE_ENV=development
API_HOST=0.0.0.0
VANO_DEV_HTTPS=1
VANO_PUBLIC_ORIGIN=https://<nome-novo-servico>.onrender.com
VITE_DEMO_MODE=false
```

O Render injeta `PORT`; o backend V2 lê `PORT` antes de `API_PORT`.

### Variáveis existentes na V1 que a V2 reconhece por NOME

```env
GOOGLE_CLIENT_ID=<configurar NO RENDER, nunca no Git>
GOOGLE_CLIENT_SECRET=<configurar NO RENDER, nunca no Git>
GOOGLE_REDIRECT_URI=https://<nome-novo-servico>.onrender.com/api/auth/google/callback
VITE_MAPBOX_PUBLIC_TOKEN=<token público com restrição de origem apropriada>
MAPBOX_SECRET_TOKEN=<se necessário, no servidor>
VANO_V1_API_URL=https://vanomaps.online
```

**Atenção:** Render NÃO repassa automaticamente env vars de outro serviço. Configure no novo serviço ou vincule um env group seguro já existente. Não copie valores para o repositório. O novo `GOOGLE_REDIRECT_URI` deve ser autorizado no Google Cloud OAuth. O callback original da V1 (`https://vanomaps.online/login/google/callback`) não serve para a prévia.

## Distinção entre prévia e produção

A V2 atual utiliza armazenamento JSON single-process. O plano Free do Render tem disco efêmero; NÃO use contas reais nem faça desta prévia a produção. Antes de substituir a V1, migre a persistência para Postgres ou instância única com disco durável, implemente estratégia de migração de usuários da V1, configure NODE_ENV=production com HTTPS e e-mail de verificação, rode audit/build/test/browser/smoke e valide OAuth/GPS/micro-rotas em dispositivo real.

## Testes locais

```bash
cd v2
npm install
npm test
npm run build
```

## Proteção da versão antiga

Não executar merge para `main` nem trocar a branch do serviço de produção antes da validação do usuário.
