# VANO Maps — guia do repositório

> Este guia descreve a branch de origem da aplicação web em produção em 25/10/2026: `preview/vano-react-v2-7`. A branch de limpeza NÃO é produção.

## Por onde começar

1. [Mapa da arquitetura](docs/ARCHITECTURE.md)
2. [Inventário de módulos e arquivos](docs/CODE_MAP.md)
3. [Operação e manutenção](docs/OPERATIONS.md)
4. [Índice de documentos técnicos](docs/DOCUMENT_INDEX.md)
5. [Registro da limpeza](docs/CLEANUP_REPORT.md)

## Entradas principais

- V2, frontend React: `v2/src/main.jsx`.
- V2, backend Node: `v2/server/index.mjs`.
- Aplicação Python/Flask: `app.py`.
- Deploy: `render.yaml`, `Dockerfile.vano-v2`.
- Android: `android-vanu/` e `android-webview/`.

Execute V2 com Node >=22.18: `cd v2 && npm ci && npm test && npm run build`.
Não compartilhe arquivos de ambiente nem chaves de provedores.
