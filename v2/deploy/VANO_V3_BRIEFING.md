# VANO V3 — briefing, páginas, rotas e console

## Objetivo

Evoluir a experiência React V2 com páginas públicas reais, SEO e descoberta por buscadores/assistentes, sem expor conta, histórico ou GPS de usuários. Criar observabilidade administrativa segura e preservar o motor original VANO Python por uma ponte até que seja possível uma migração transacional.

## Inventário público auditado no Flask V1

Caminhos encontrados em `vano/routes/public.py` e equivalentes novos:

| Publicações V1 | VANO V2 | Observação |
| --- | --- | --- |
| `/about`, `/sobre` | `/sobre` | Alias e conteúdo institucional |
| `/help` | `/ajuda` | Ajuda e perguntas frequentes |
| `/contato` | `/contato` | Sem e-mail inventado; canais oficiais dependem de configuração |
| `/imprensa` | `/imprensa` | Página institucional |
| `/testar` | `/testar` | CTA para mapa; formulário legado de feedback não está portado |
| `/terms`, `/termos-de-uso`, `/termos` | `/termos-de-uso` | Texto explicativo **preliminar; exige revisão jurídica** |
| `/privacy`, `/politica-de-privacidade`, `/privacidade` | `/politica-de-privacidade` | Texto preliminar; LGPD exige revisão e controlador identificado |
| `/excluir-conta` | `/excluir-conta` | Orientação de exclusão; processo autenticado segue em Minha conta |
| `/o-que-e-vano-maps` | mesmo | Conteúdo sobre produto |
| `/rotas-para-evitar-transito` | mesmo | Conteúdo sobre tráfego e limitações |
| `/alternativa-ao-waze` | mesmo | VANO independente e não afiliado ao Waze |
| `/rota-mais-rapida` | mesmo | Conceitos de otimização de tempo |
| `/alternativa-ao-google-maps` | mesmo | VANO independente e não afiliado ao Google Maps |
| `/gps-para-moto` | mesmo | Perfil motocicleta e segurança de trânsito |
| `/benchmark-de-rotas` | mesmo | Guia informativo; **endpoint de benchmark V1 NÃO portado** |
| *nova* `/como-funciona` | nova | Primeiros passos |
| *nova* `/seguranca-na-navegacao` | nova | Informação de segurança e privacidade |

O inventário cobre rotas **públicas e editoriais** de `vano/routes/public.py`. Não inclui páginas privadas, painel do Flask, URLs dinâmicas com tokens (compartilhamento de trajetos), rotas de API nem todos os templates de versões antigas. Elas exigem migração separada. As páginas antigas de formulário `/testar` e `/privacy/request` continuam sem a lógica operacional da V1 na V2.

## Mecanismo de SEO

- Conteúdo real e navegável renderizado em React com identidade VANO 2.9.
- HTML estático gerado automaticamente em `dist/<slug>/index.html` para leitura sem JavaScript, com `<title>`, description, canonical, Open Graph e JSON-LD.
- `sitemap.xml`, `robots.txt` e `llms.txt` produzidos pelo build. `robots.txt` permite material público, mas desaconselha crawling de `admin`, contas, autenticação e páginas privadas.
- Por padrão **`VANO_SEO_INDEXABLE=0`** mantém homologação fora do índice, embora as páginas permaneçam publicamente acessíveis; somente após validar domínio, contratos e políticas alterar para `1`.
- `VANO_SEO_ORIGIN=https://vanomaps.online` mantém URLs canônicas futuras; na homologação isso não significa que a V2 já responde neste domínio.
- A presença de `llms.txt` ou sitemap **não garante** indexação pelos modelos de IA, nem autoriza leitura de dados protegidos.

## Motor de rotas

V1 Flask tem código substantivo em `vano/routes/routing.py`, `vano/services/routing.py`, `vano/services/safety.py`, integração de nós, cache, relatos e análise contextual. V2 não é equivalente a esse motor apenas por renderizar alternativas Mapbox.

**Fase atual:** `server/v1-bridge.mjs` faz solicitações de rotas ao backend Python **quando** `VANO_V1_API_URL` está habilitado. Consulta modos `safest` e `fastest`, parâmetros básicos de GPS/veículo, normaliza duração/metros e mantém marcadores de micro-rotas quando devolvidos pela fonte real. Caso contrário, V2 utiliza Mapbox com aviso de ausência de avaliação de segurança.

**Para ativar:** estabelecer URL HTTPS estável e autenticada entre serviços, verificar limites de convidado/rate-limit/cobertura e uso das bases V1, testar roteamento em carga e isolamento de origem. **Não** desativar a API V1 antes de portar ou substituir suas dependências. A cópia integral do motor Python, seus bancos e telemetria **não está concluída**.

## Console do proprietário (`@MiguelPCSS`)

**Autorização:** nome de exibição / handle **não é credencial**. Definir a variável de ambiente 
`VANO_ADMIN_EMAILS` com o e-mail exato da conta, após e-mail verificado, ou 
`VANO_ADMIN_GOOGLE_SUBS` com o `sub` imutável da identidade Google verificada.

O backend compara a identidade verificada em sessão HttpOnly; somente o proprietário autorizado recebe `user.isAdmin=true`, consegue consultar `/api/admin` e `/api/admin/users`; todos os demais recebem 401/403. A configuração deve ser realizada no Render por canal seguro; **não versionar valores de identificação ou segredos**.

Painel oferece: total de contas/verificações/vínculos Google, quantidade de rotas e recortes de 24 horas, erros e latência agregados, relatos, favoritos/rotinas, situação da configuração das integrações e listagem paginada limitada de contas. Sem exibir hashes, tokens, dados exatos de GPS, rotas de outros usuários ou históricos privados. A telemetria de requisições é volátil por processo e reinicia no deploy; dados de conta/histórico dependem do armazenamento.

## Qualidade, privacidade e gates

1. Verificar em staging `/sobre`, `/termos-de-uso`, `/alternativa-ao-waze`, `/benchmark-de-rotas`, `/llms.txt`, `/robots.txt`, `/sitemap.xml` sem JavaScript.
2. Confirmar 401 sem sessão e 403 para usuários comuns em ambos endpoints `/api/admin` e `/api/admin/users`.
3. Configurar owner real via `VANO_ADMIN_EMAILS` ou `VANO_ADMIN_GOOGLE_SUBS`, conectar Google OAuth real e validar autorização.
4. Migrar armazenamento JSON da V2 para PostgreSQL persistente antes de tratar o console como relatório confiável de produção. Conta e histórico no plano gratuito Render podem ser perdidos após reinício.
5. Conferir SEO/legal com responsável antes de habilitar indexação. Não copiar dados pessoais/segredos para HTML público.
6. Testar micro-rotas em V1 com o bridge após configurar serviço, sem prometer equivalência quando Mapbox estiver isolado.
7. Nunca excluir `vaigo-1` ou apontar `vanomaps.online` para V2 até a migração de bancos/autenticação/rotas estar validada.

## Deployment

- Repositório `miguel027dev/vano`, branch `preview/vano-react-v2-7`, pasta `v2/`.
- Novo serviço Vanu no workspace secundário: `https://vanu-73xu.onrender.com`.
- Build Render: `cd v2 && npm install --no-audit --no-fund && npm test && npm run build`.
- Variáveis novas opcionais: `VANO_SEO_ORIGIN`, `VANO_SEO_INDEXABLE`, `VANO_ADMIN_EMAILS`, `VANO_ADMIN_GOOGLE_SUBS`.
- Não habilitar admins automaticamente por `MiguelPCSS` no nome, nem expor dados pessoais aos crawlers.
