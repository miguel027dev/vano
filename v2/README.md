# VANO Maps V2.6 — reestruturação de segurança

Cópia da versão React V2.5 com melhorias na autenticação, privacidade, integridade das rotas, armazenamento e publicação. **A V1 principal não é alterada.**

## Instalação no Zorin (prévia local)

Pare o servidor da V2, extraia este ZIP em `~/Projetos/VANO/` e execute:

```bash
cd ~/Projetos/VANO/vano-react-v2
source ~/.nvm/nvm.sh
nvm use 22
npm install --no-audit --no-fund
npm run test
npm run build
bash iniciar-v2.sh --rede
```

Abra `http://localhost:5174/inicio` no Zorin. No celular, o terminal mostrará o endereço IP. **Não envie senhas por HTTP na rede local**: o servidor bloqueia operações de conta por IP HTTP. Para testes de contas/GPS no celular, utilize `bash iniciar-v2.sh --https` e confie no certificado local no dispositivo. Jamais instale a chave privada da autoridade certificadora no telefone.

O instalador ajusta `data/` para `0700`, banco para `0600` e `.env` para `0600`. Na primeira migração, sessões antigas armazenadas em texto puro são invalidadas, mas contas e favoritos permanecem. É necessário **entrar novamente** na conta. O ZIP não inclui `.env`, `data/store.json`, banco de clientes ou certificado.

## Corrigido

- Respostas de relatos públicos não expõem `owner` nem coordenadas exatas; relatos pendentes são visíveis apenas ao autor.
- Sessões do backend armazenam SHA-256 do token, nunca o token em texto puro. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS, expiração de sete dias.
- Todas as operações de escrita exigem token CSRF vinculado à sessão e origem apropriada.
- Rate limiting independente por IP e por identidade de conta; cotas de consultas ao Mapbox e de dados por usuário.
- Histórico aceita apenas prova assinada e curta de uma rota calculada no servidor; números enviados pelo navegador são ignorados. Proteção contra replay.
- Banco privado, salvamento atômico, backup privado e travamento para impedir dois processos com o mesmo arquivo; corrupção interrompe o serviço, sem reset silencioso.
- Validação de tamanho e tipo das requisições, validação de campos e mensagens de erro sem stack trace em HTTP.
- Recuperação e verificação de e-mail via Resend em ambientes configurados; produção se recusa a iniciar sem provedor de e-mail.
- Confirmação de senha atual para apagar uma conta; exportação de dados pessoais.
- Cabeçalhos CSP, HSTS no modo produção, proteção contra enquadramento e política de referência restritiva.
- Endpoint `/api/admin` continua indisponível; nada de painel sensível exposto.

## Produção: NÃO basta executar `--rede`

1. Hospede em VPS Linux com usuário dedicado, disco persistente privado, backups externos protegidos, DNS próprio e TLS público válido.
2. Instale Node LTS atualizado, Caddy e service unit usando exemplos em `deploy/`.
3. Gere `VANO_SECURITY_SECRET` com `openssl rand -hex 32`. Configure os segredos no servidor, nunca no Git/ZIP. Configure `VANO_PUBLIC_ORIGIN=https://...` e um e-mail remetente verificado no Resend. Regras de SPF/DKIM/DMARC precisam estar prontas.
4. Configure o token **público** `VITE_MAPBOX_PUBLIC_TOKEN=pk...` também durante `npm run build` (o frontend lê essa variável durante a compilação). Nunca inclua `sk.*` no build.
5. O armazenamento JSON só permite **uma instância Node por banco**, autorizado com `VANO_ALLOW_SINGLE_INSTANCE_JSON=1`. Para escala horizontal, alta disponibilidade e múltiplos workers é necessária uma migração para banco transacional como PostgreSQL. **Não use múltiplas instâncias no mesmo arquivo.**
6. No Zorin (ou CI com acesso ao npm), execute `npm install`, gere/versione `package-lock.json`, depois `npm ci`, `npm run test`, `npm run build`, `npm audit --audit-level=moderate` e `npm run security:config`. Falha de auditoria, dependência insegura ou sem acesso ao registro bloqueia o release.
7. Revise se V1 API remota realmente fornece micro-rotas e está autorizada para acesso servidor-servidor; o fallback Mapbox **não é o algoritmo V1**. Verifique quotas, latência e resultados em ambiente real.
8. Execute testes de ponta a ponta no HTTPS real (cadastro, recebimento de e-mail, confirmação, recuperação, exclusão, sessão entre navegadores, geolocalização e rotas), auditoria de dependências, backup/restauração e avaliação independente. Ajuste a política LGPD e os termos com revisão jurídica antes de receber usuários reais.

**Importante:** o pacote é uma *candidata endurecida*; não equivale a uma homologação de produção. Não há como validar DNS, provedor de e-mail, Play Store, GPS físico, infra real e vulnerabilidades de todas as bibliotecas sem os recursos externos.

## Scripts

- `npm run test` — testes unitários e integração de segurança.
- `npm run build` — build de frontend.
- `npm run security:audit` — consulta as vulnerabilidades conhecidas via npm.
- `npm run security:check` — testes + build + auditoria npm (precisa internet).
- `npm run security:config` — confere requisitos obrigatórios de publicação.
- `NODE_ENV=production node server/index.mjs` — produção atrás do Caddy, servindo `dist/` (não Vite).

## Manutenção e reversão

Não sobrescreva `.env`, certificados nem `data/store.json`. Faça cópia privada desses arquivos antes de atualizar. A primeira migração derruba sessões antigas. Não restaure versões antigas de arquivos de sessão após a migração. Para restauração de backup, interrompa o serviço antes de substituir o arquivo, valide JSON e permissões, reinicie uma única instância e teste contas/dados.

## Idioma e preferência de rota (V2.7)

Veja [V2_7_LOCALES.md](V2_7_LOCALES.md). O idioma inicial é sugerido pelo país informado por proxy confiável; sem esse dado, pelo fuso/idioma do navegador. O cadastro pede idioma e salva a escolha na conta. A escolha entre rota rápida e segura é mais compacta e não altera o algoritmo.
