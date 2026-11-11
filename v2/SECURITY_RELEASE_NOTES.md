# VANO V2.6 — fechamento das falhas de segurança da V2.5

## Correções aplicadas (código)

| Achado anterior | Correção V2.6 | Teste |
| --- | --- | --- |
| Relatos expunham ID de autor e localização exata | `reportPublic()` remove `owner`, reduz coordenadas a ~100m e só entrega relatos verificados ou próprios | `server/api.test.mjs` |
| Sessões em texto puro / disco 0644 | SHA-256 de tokens, invalidação de sessões antigas, `0600` arquivo, `0700` diretório, backup privado | testes de migração/permissões |
| Cadastro podia trocar e-mail para contornar limite | Limites separados por IP e hash de e-mail, além de limite por rota | teste 7 cadastros |
| Estatísticas falsas no histórico | Prova HMAC de rota real com expiração, vinculação ao autor e destino, proteção contra replay; métricas derivadas do servidor | teste fake V1 |
| Escritas sem CSRF e origem validada | `X-VANO-CSRF` por sessão/visitante, validação de `Origin` e `Sec-Fetch-Site` | teste 403 CSRF/origem |
| Supressão de erros do banco | JSON inválido ou arquivo inseguro impede o startup, com escrita atômica e lock para instância única | teste corrupção/lock |
| Login sem confirmação / recuperação | Fluxos de confirmação e reset com tokens de uso único e hash, transporte por e-mail configurado | teste tokens de uso único |
| Exclusão com sessão apenas | Confirmação da senha atual e invalidação das sessões | teste exclusão |
| HTTP para contas reais | Produção exige HTTPS via proxy, sessões Secure e configuração explícita; acesso HTTP por IP local bloqueia operações de conta | teste 426/CSP/Secure |
| Cotação/custos ilimitados Mapbox | Rate limit em `/api/route`, `/api/search`, `/api/reports` e cota de dados por proprietário | testes de limite + revisão |
| CSP e cabeçalhos ausentes | CSP, HSTS, X-Frame-Options, Referrer-Policy, CORP, Permissions-Policy | smoke de headers |
| Dependências com semver antigo | Mínimos `vite ^6.4.4` e `react-router-dom ^7.14.2`; auditoria via `npm audit` no pipeline | exige registro npm |

## Limites honestos

- Os 29 testes incluídos exercitam classes importantes de vulnerabilidades, **não provam ausência de outras falhas**.
- `npm audit`, bundle Vite e testes browser completos não rodaram no ambiente de montagem por falha de DNS do registro npm (`EAI_AGAIN`).
- Não há teste real dos serviços Resend, Caddy, DNS, certificados públicos, Android, Play Store ou motor Python V1 neste ambiente.
- JSON com lock serve somente UMA instância e disco persistente privado. Para escala e failover, use banco transacional e controles de infraestrutura.
- O fluxo Google OAuth permanece fora do escopo até existirem credenciais corretas.
- Relatos não verificados não são disponibilizados a terceiros; para relatos públicos é necessário moderação.
- É necessária revisão jurídica da política de privacidade, dos termos, faixa etária e retenção antes de comercialização.

**Condição de lançamento:** `npm run security:check`, `npm run security:config`, smoke HTTPS, email real, V1 autorizada, monitoramento, backup restaurado com sucesso, testes funcionais em navegadores/celular e aprovação de revisão externa de segurança.
