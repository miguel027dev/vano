# Operação, build, testes e recuperação

## Execução local

V2: `cd v2 && npm ci && npm test && npm run build`. Ambiente mínimo: Node >= 22.18.
Python: `python -m pip install -r requirements.txt -r requirements-dev.txt` e `VANO_SKIP_DB_INIT=1 VANO_DB_INIT_ONLY=1 VANO_KEEPALIVE_ENABLED=0 pytest -q`.
A instalação real depende de serviços, dados e segredos não disponíveis aqui.

## Configuração

Verifique `vano/config.py`, `v2/server/` e definições do Render antes de configurar credenciais. Exemplos de nomes de ambiente: `DATABASE_URL`, `VANO_SECRET_KEY`, `MAPBOX_ACCESS_TOKEN`, `VANO_ADMIN_EMAIL`. Outros nomes devem ser validados no código. Nunca versionar valores privados.

## Publicação

Produção no Render (checado em 25/10/2026): serviço `vanu`, repo `miguel027dev/vano`, branch `preview/vano-react-v2-7`; deploy automático desligado.
Não trocar branch, fazer merge ou iniciar deploy sem revisar os testes e diffs.

## Restauração

A branch original permanece intacta. No clone de trabalho, `git switch preview/vano-react-v2-7` retorna à referência original; alterações que não foram commitadas devem ser preservadas antes de alternar.
Use `git diff preview/vano-react-v2-7...chore/vano-architecture-cleanup-20261025` para auditar.
