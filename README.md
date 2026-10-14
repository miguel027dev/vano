# VANO MAPS

<p align="center">
  <strong>Uma navegação mais consciente para cada caminho.</strong><br />
  Rotas, contexto viário e uma experiência pensada para se mover pelo Brasil.
</p>

<p align="center">
  <a href="https://vanomaps.online">Abrir VANO</a> ·
  <a href="#começar-a-desenvolver">Desenvolver</a> ·
  <a href="#mapa-do-repositório">Conhecer o código</a>
</p>

---

## O que está sendo construído

O VANO MAPS é uma aplicação web de navegação. Ela combina busca de destinos, cálculo de rotas, contexto da via, alertas comunitários e preferências de cada pessoa para apresentar uma viagem mais útil — não apenas a mais curta.

O produto inclui:

- mapa interativo e navegação ao vivo para carro, moto e a pé;
- pesquisa de endereços, locais e pontos de interesse;
- rotas com perfis de rapidez, equilíbrio e segurança;
- contexto de trânsito, clima, obras, radares e condições mapeadas da via;
- conta, preferências, rotinas e compartilhamento de rota;
- páginas públicas, SEO, beta, imprensa e benchmark de rotas;
- painel administrativo e telemetria operacional;
- embalagem Android por WebView, sem uma segunda base de produto.

```text
Pessoa no navegador / Android
             │
             ▼
   Templates + JavaScript + CSS
             │
             ▼
       Flask (app.py)
   ┌─────────┼──────────┐
   ▼         ▼          ▼
rotas    serviços    segurança
   │         │          │
   └──── PostgreSQL ────┘
             │
             ▼
 Mapbox · OpenStreetMap · Open-Meteo · provedores opcionais
```

## Tecnologias

| Camada | Escolha no VANO |
| --- | --- |
| Servidor | Python + Flask + Gunicorn |
| Dados | PostgreSQL (`psycopg2`) |
| Interface | Jinja, JavaScript sem framework obrigatório e CSS próprio |
| Mapa e rotas | Mapbox; fontes complementares são opcionais e possuem fallback |
| Deploy | Render Blueprint (`render.yaml`) |
| Qualidade | Pytest, testes de comportamento em Node, Bandit e pip-audit |

## Mapa do repositório

Use esta seção como índice antes de alterar qualquer coisa. Os módulos em `vano/` são carregados pelo `app.py` por meio de `vano/bootstrap.py`; isso permite a migração gradual do antigo núcleo monolítico para módulos por domínio.

### Entrada, configuração e dados

| Arquivo ou pasta | Onde mexer |
| --- | --- |
| `app.py` | Cria a aplicação Flask, registra os módulos, configura middleware, erros e respostas autenticadas de rota. É a porta de entrada do servidor. |
| `vano/bootstrap.py` | Ponte de compatibilidade entre o núcleo e os módulos. Só altere ao mudar a estratégia de modularização. |
| `vano/config.py` | Lê ambiente e concentra URLs, limites, integrações, estilos de mapa e switches de recurso. Adicione aqui uma variável nova antes de consumi-la. |
| `db_backend.py` | Adaptador e pool PostgreSQL. Não há fallback SQLite: produção depende de `DATABASE_URL`. |
| `vano/infrastructure/database.py` | Esquema, inicialização e migrações aditivas do banco; também abriga utilitários de senha. |
| `vano/infrastructure/access_logging.py` | Registro de acesso associado a conta. |
| `vano/infrastructure/observability.py` | Métricas, saúde e observabilidade da aplicação. |
| `gunicorn.conf.py` | Ajustes locais do servidor Gunicorn. |
| `render.yaml` | Blueprint de produção no Render: build, inicialização, serviço e variáveis. Não coloque segredos reais aqui. |

### HTTP, sessão e proteção

| Arquivo ou pasta | Onde mexer |
| --- | --- |
| `vano/routes/core.py` | Páginas e comportamentos centrais da experiência de mapa. |
| `vano/routes/auth.py` | Cadastro, login, OAuth, recuperação e sessão. |
| `vano/routes/routing.py` | Endpoints que recebem uma viagem e devolvem alternativas de rota. |
| `vano/routes/api.py` | APIs consumidas pela interface, dispositivos e integrações. |
| `vano/routes/community.py` | Alertas, relatórios e recursos comunitários. |
| `vano/routes/public.py` | Páginas públicas, SEO, beta, contato e imprensa. |
| `vano/routes/admin.py` | Painéis e ações protegidas de administração. |
| `mobile_routes.py` | Rotas e retorno de autenticação próprios do contêiner Android. |
| `vano/security/auth.py` | Autorização, papéis, CSRF e limites de tentativa. |
| `vano/security/sessions.py` | Sessões persistidas e revogáveis. |
| `vano/security/headers.py` | Cabeçalhos de segurança e políticas de navegador. |
| `vano/security/route_integrity.py` | Validação e atestação das respostas de rota. |
| `vano/security/redaction.py` | Ocultação de dados sensíveis em logs e respostas. |

### Inteligência de rota e serviços

| Arquivo ou pasta | Onde mexer |
| --- | --- |
| `vano/services/routing.py` | Orquestra provedores e monta candidatos de rota. É o ponto principal para regras de cálculo. |
| `vano/services/route_cache.py` | Cache de rotas e invalidação. |
| `vano/services/search.py` | Busca, geocodificação e normalização de resultados. |
| `vano/services/context.py` | Contexto de viagem: clima, via, eventos e dados mapeados. |
| `vano/services/safety.py` | Pontuação e recomendações de segurança. |
| `vano/services/nodes.py` | Coordenação dos nós distribuídos de cálculo. |
| `vano/services/voice_assistant.py` | Assistente de voz offline-first; provedores remotos ficam desativados por padrão. |
| `vano/services/indexnow.py` | Envio controlado de URLs públicas para descoberta. |
| `vano_ai_routing.py` | Reordenação opcional de candidatos por IA. Mantém fallback determinístico. |
| `vano_radars.py` | Catálogo, consulta e persistência de radares. |
| `vano_osint_bridge.py` | Ponte opcional para a integração de inteligência externa, protegida por consentimento e chaves. |

### Interface e conteúdo

| Arquivo ou pasta | Onde mexer |
| --- | --- |
| `templates/base.html` | Casca comum: metadados, carregamento de assets e estrutura compartilhada. |
| `templates/index.html` | Tela principal do mapa e da navegação. |
| `templates/live_trip.html` | Interface da viagem em andamento. |
| `templates/acessar.html`, `login.html`, `register.html`, `forgot_password.html`, `reset_password.html` | Fluxos de acesso e recuperação. |
| `templates/onboarding.html`, `profile.html` | Preferências e perfil da pessoa usuária; as rotinas são apresentadas na experiência de mapa. |
| `templates/alerts.html`, `report.html`, `notifications.html`, `shared_route.html` | Alertas, reporte, notificações e compartilhamento. |
| `templates/admin*.html` | Telas administrativas; mantenha a autorização no backend. |
| `templates/benchmark_de_rotas.html` | Laboratório público de benchmark. |
| `templates/about.html`, `sobre.html`, `help.html`, `beta.html`, `contact.html`, `press.html` | Conteúdo institucional e suporte. |
| `templates/seo_*.html` | Páginas orgânicas de descoberta; preserve canonical, título e descrição. |
| `templates/_*.html` | Parciais reutilizadas para tema, SEO e diagnósticos. |
| `static/vano-map.js` | Inicialização do mapa, camadas e interação geográfica. |
| `static/vano-runtime.js` | Comportamentos globais carregados em toda a aplicação. |
| `static/vano-ui.js` | Componentes e interações compartilhadas da interface. |
| `static/vano-v2.js`, `static/vano-v2.css` | Camada visual e interações da evolução V2. |
| `static/vano.css`, `static/vano-foundation.css`, `static/vano-runtime.css` | Base visual, tokens e regras globais. |
| `static/vano-auth-startup.js`, `vano-login-startup.js`, `vano-onboarding.js`, `vano-profile.js`, `vano-routine.js` | Scripts específicos das jornadas de acesso, início, perfil e rotina. |
| `static/vano-theme.js`, `vano-i18n.js`, `vano-telemetry.js`, `vano-sw.js` | Tema, idioma, telemetria e service worker. |
| `static/vano-admin-*.js` | Comportamentos dos painéis administrativos. |
| `static/vano-benchmark*.js` | Interface pública e administrativa do benchmark. |
| `static/icons/vano/` | Ícones de alertas, veículos e POIs. Cada arquivo descreve um símbolo mostrado no mapa. |
| `static/mapbox/` | Configurações de estilo 3D do Mapbox. |
| `static/voices/vano/` | Frases de orientação usadas pela experiência de voz. |
| `static/manifest.webmanifest`, `static/vano-access.js` | Metadados PWA e recursos de acessibilidade/entrada. |

### Plataforma, qualidade e documentação

| Arquivo ou pasta | Onde mexer |
| --- | --- |
| `android-webview/` | Empacotamento Android: manifesto, tema, ícone, atividade Java e script de build. |
| `docs/` | Planos e decisões técnicas. Atualize o documento temático ao introduzir uma mudança estrutural. |
| `tests/` | Regressões de backend e contratos de interface. Arquivos `.cjs` verificam comportamento JavaScript. |
| `test_vano_radars.py` | Cobertura histórica isolada do módulo de radares. |
| `requirements.in` | Dependências humanas de alto nível. |
| `requirements.lock` | Versões e hashes reproduzíveis instalados em produção. |
| `requirements.txt` | Ponto de instalação bloqueado; referencia o lockfile. |
| `requirements-dev.txt` | Ferramentas de desenvolvimento e auditoria. |
| `.github/workflows/ci.yml` | Pipeline de compilação, segurança e testes no GitHub Actions. |
| `.github/workflows/android-candidate.yml` | Validação e geração da candidatura Android. |
| `robots.txt`, `sitemap.xml` | Regras e inventário para mecanismos de busca. |

> **Regra de assets:** os nomes em `static/` são canônicos. Para invalidar cache, use `VANO_BUILD_ID`/`RENDER_GIT_COMMIT`; não crie arquivos `*-vNNN.*`.

## Começar a desenvolver

### 1. Pré-requisitos

- Python 3.13 (o CI usa essa versão);
- Node.js 22 para as verificações dos scripts de interface;
- PostgreSQL 16 ou uma instância compatível;
- token do Mapbox para mapa, busca e rotas reais.

### 2. Criar o ambiente

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt
```

Crie um `.env` local — ele não deve ser versionado:

```dotenv
DATABASE_URL=postgresql://usuario:senha@localhost:5432/vano
VANO_SECRET_KEY=gere-uma-chave-aleatoria-longa
VANO_ADMIN_EMAIL=voce@exemplo.com
MAPBOX_ACCESS_TOKEN=seu-token-mapbox
PUBLIC_SITE_URL=http://localhost:5000
VANO_KEEPALIVE_ENABLED=0
```

Configure apenas as integrações que você vai usar. As opções de IA, OAuth, tráfego, OSINT e provedores alternativos são opcionais; veja `vano/config.py` e `render.yaml` para a lista completa. Nunca envie `.env`, tokens ou URL de banco para o Git.

### 3. Inicializar e executar

Com o PostgreSQL acessível:

```bash
VANO_SKIP_DB_INIT=1 VANO_DB_INIT_ONLY=1 python -c "from app import init_db_with_retry; init_db_with_retry()"
python app.py
```

Abra `http://localhost:5000`. Se você estiver trabalhando apenas na interface, mantenha `VANO_KEEPALIVE_ENABLED=0` para não disparar verificações externas.

### 4. Verificar antes de enviar

```bash
python -m compileall -q app.py vano db_backend.py mobile_routes.py vano_osint_bridge.py vano_ai_routing.py vano_radars.py
find static -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 -n1 node --check
pytest -q
pip-audit -r requirements.txt
bandit -q -lll -r app.py vano mobile_routes.py vano_osint_bridge.py vano_ai_routing.py vano_radars.py
```

Para testes que inicializam o banco, forneça `TEST_DATABASE_URL` apontando para uma base descartável. O CI cria um PostgreSQL isolado e define os switches necessários.

## Como fazer uma mudança sem se perder

1. **Nova página:** crie o template em `templates/`, adicione a rota no módulo adequado de `vano/routes/` e cubra o fluxo em `tests/`.
2. **Novo endpoint:** comece por `vano/routes/api.py` ou `vano/routes/routing.py`; deixe regras e chamadas externas em `vano/services/`.
3. **Nova preferência ou dado persistido:** adicione uma migração aditiva em `vano/infrastructure/database.py`, exponha-a no serviço/rota e teste a leitura e escrita.
4. **Mudança no mapa:** coordene `static/vano-map.js`, a tela que o carrega e, quando necessário, os estilos em `static/mapbox/`.
5. **Mudança visual:** priorize os arquivos CSS canônicos e componentes já existentes. Verifique desktop e mobile.
6. **Nova variável:** documente-a em `vano/config.py` e, se necessária em produção, declare-a no `render.yaml` sem inserir segredo.

## Arquitetura em prática

```text
Request HTTP
  └─ app.py
      ├─ vano/security/     autentica, limita e protege
      ├─ vano/routes/       decide qual endpoint responde
      ├─ vano/services/     aplica regras de busca, rota e contexto
      ├─ vano/infrastructure/ + db_backend.py
      │                      persiste e observa
      └─ templates/ + static/
                             apresenta a experiência
```

O `app.py` ainda concentra algumas funções históricas. Ao evoluir o produto, prefira acrescentar comportamento no módulo de domínio apropriado e manter o bootstrap compatível, em vez de aumentar o monólito.

## Deploy

O `render.yaml` descreve o serviço web do Render. Ele instala dependências bloqueadas, executa a inicialização não destrutiva do banco e inicia o Gunicorn. Antes de publicar, confirme no ambiente de deploy ao menos:

- `DATABASE_URL`
- `VANO_SECRET_KEY`
- `VANO_ADMIN_EMAIL`
- `MAPBOX_ACCESS_TOKEN`
- `PUBLIC_SITE_URL`

As integrações opcionais devem ser habilitadas somente quando houver chave, finalidade e consentimento adequados.

## Princípios do projeto

- Segurança e privacidade não são detalhes de interface.
- Rota recomendada deve explicar contexto, sem prometer precisão que a fonte não oferece.
- A aplicação deve continuar útil quando uma integração externa falhar.
- Mudanças pequenas, cobertas por teste, vencem refatorações opacas.
- Interface rápida, legível e segura vem antes de enfeite.

---

Feito para transformar cada deslocamento em uma decisão um pouco melhor. 🧭
