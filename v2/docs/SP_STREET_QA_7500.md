# QA de 7.500 ruas — VANO /v2 (administrador)

**Tipo:** documentação de implantação e limite de evidência; o painel `QA SP` é **somente leitura** e privado na rota `/v2`.
**Base cartográfica:** CEM/USP LOG2025 RMSP recortada para município de São Paulo. SHA-256 do ZIP original: `f9e2cafb8009cdd148c023b3415b3f62c8f220a0955da4dfb0df4dd6f0ac5f2c`.

## Resultado auditado
- 7.500 ruas com IDs únicos em 97 distritos de referência.
- 7.421 conferidas **internamente** com nome/distrito, segmentos e extensão CEM.
- 79 em revisão (divergências geométricas, nomes e extensão; categorias sobrepostas).
- 0 observações de congestionamento histórico validado, 0 velocidades por 15 min homologadas, 0 sentidos legais auditados, 0 alternativas autorizadas, 0 registros aplicáveis a roteamento.
- A cobertura de 24 horas dos CSVs originais é **grade de coleta**, não medição de trânsito.
- A base CEM é cartografia, não medição de trânsito.

## Interface e segurança
- A tela `/v2`, exclusiva do administrador, mostra botão `QA SP` e consulta o endpoint autenticado `GET /api/admin/sp-street-audit` (rate limit e cache privado).
- O endpoint fornece contagens e metadados de auditoria, **não publica** ZIP bruto, nomes de ruas, posições, credenciais ou dados de velocidade.
- Para consultar individualmente as 7.500 ruas, o administrador pode selecionar o arquivo `VANO_SP7500_Auditoria_Cruzamento_CEM2025.csv` no painel. O CSV é lido localmente no navegador (sem upload); IDs, formato, nomes, 7.421/79 e ausência de picos inventados são validados antes de aparecer a pesquisa. Sem arquivo, o painel apresenta o resumo do servidor.
- Não existe rota de importação ativa, conversão de contagem em atraso, gravação de observações, modificação de MAVI, GPS, ETAs ou route engine. Flag de trânsito histórico permanece independente.
- Para ativação futura: conferir cada segmento na CET e GeoSampa, validar topologia e sentidos de circulação, elevação e alternativas, obter dados **históricos com direito de retenção** e cobertura por segmento+sentido+dia+janela de 15 min; executar replay/holdout antes de habilitar qualquer impacto.

## Fontes de consulta
- Base original CEM/USP: https://centrodametropole.fflch.usp.br/pt-br/node/17657
- CET, lista classificatória vigente desde 15/12/2025: https://ssl.cetsp.com.br/consultas/classificacao-viaria.aspx
- GeoSampa: https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx
- TomTom Traffic Stats: https://docs.tomtom.com/traffic-stats/documentation/product-information/introduction

**Pendência principal:** a listagem CET em XLSX e a camada GeoSampa não foram baixadas para validação cartográfica externa nesta etapa. Não afirmar homologação nem uso de ETAs históricos; o app exibe o status real de auditoria.
