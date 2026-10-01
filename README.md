# VANO MAPS

Aplicação web de navegação e rotas do VANO MAPS.

## Estrutura

- `app.py`: composição da aplicação Flask e registro dos módulos.
- `vano/config.py`: configuração e variáveis de ambiente.
- `vano/infrastructure/`: PostgreSQL e observabilidade.
- `vano/security/`: autenticação, sessão, CSRF e headers.
- `vano/services/`: busca, rotas, segurança, contexto e infraestrutura distribuída.
- `vano/routes/`: rotas HTTP separadas por domínio.
- `static/`: assets canônicos, sem versão no nome do arquivo.
- `templates/`: templates Jinja.
- `docs/`: documentação técnica atual.

## Versionamento

Os assets usam nomes estáveis. O cache-busting vem de `VANO_BUILD_ID`, que usa `RENDER_GIT_COMMIT` quando disponível.
Não crie novos arquivos `*-vNNN.*`.

## Desenvolvimento

```bash
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt
VANO_SKIP_DB_INIT=1 VANO_DB_INIT_ONLY=1 VANO_KEEPALIVE_ENABLED=0 pytest -q
```

Para produção, configure `DATABASE_URL`, `VANO_SECRET_KEY`, `VANO_ADMIN_EMAIL`, `MAPBOX_ACCESS_TOKEN` e as integrações necessárias.
