# VANO Radar Intelligence V400

## Fluxo

1. O mapa chama `/api/road-awareness` somente quando a camada de sinais está ativa e a câmera/GPS muda de célula.
2. O backend consulta primeiro `radar_points` no PostgreSQL.
3. Se a célula ainda não foi atualizada dentro do TTL, o backend consulta em paralelo apenas as fontes aplicáveis à coordenada.
4. Cada registro externo é normalizado e recebe uma `geo_key` geográfica. Fontes diferentes apontando para o mesmo ponto atualizam o mesmo registro.
5. Os pontos ficam persistidos. A próxima pessoa que passar pela área recebe a base VANO antes de depender da fonte externa.
6. A posição do usuário não é gravada em `radar_points`. `radar_scan_cells` guarda apenas uma célula aproximada + fonte + timestamps de atualização.

## Fontes embutidas

- OpenStreetMap / Overpass: cobertura global de base.
- ANTT: Brasil, descoberta automática do recurso JSON mais recente via CKAN.
- DGT: Espanha, recurso DATEX II descoberto via CKAN.
- France Open Data: camada complementar.
- Singapore Police Force / data.gov.sg.
- Taiwan National Police Administration.
- Hong Kong Transport Department.
- Transport for NSW.
- Chicago DOT (speed + red-light cameras).
- Washington DC DDOT.
- Ottawa ASE + red-light cameras.
- Edmonton Open Data (zonas móveis).
- Uzbekistan open OSM-derived camera dataset.

Fontes espelho do OSM (por exemplo, downloads globais que apenas republicam os mesmos nós) não são consultadas simultaneamente porque isso aumenta tráfego e duplicação sem aumentar cobertura real. Elas podem ser adicionadas como feed customizado se necessário.

## Variáveis opcionais

- `VANO_RADARS_ENABLED=1`
- `VANO_RADARS_REMOTE_ENABLED=1`
- `VANO_RADAR_HTTP_TIMEOUT=6.5`
- `VANO_RADAR_CELL_TTL_HOURS=18`
- `VANO_RADAR_FAILURE_RETRY_MIN=30`
- `VANO_RADAR_MAX_RADIUS_M=6500`
- `VANO_RADAR_DISABLED_SOURCES=fonte1,fonte2`
- `VANO_RADAR_FEEDS_JSON=[...]` para conectar novos CSV/JSON HTTPS sem alterar Python.

Exemplo de feed customizado:

```json
[
  {
    "name": "cidade_exemplo",
    "url": "https://dados.exemplo.gov/radares.csv",
    "format": "csv",
    "lat": "latitude",
    "lon": "longitude",
    "type": "tipo",
    "speed": "limite",
    "id": "id",
    "road": "endereco",
    "country": "BR",
    "official": true,
    "bbox": [-24.2, -47.2, -22.8, -45.0],
    "cell_ttl_hours": 24
  }
]
```

## Endpoint de diagnóstico

`GET /api/radars/sources?lat=-23.55&lon=-46.63`

Mostra quais conectores estão instalados e quais são elegíveis para aquela posição. Não retorna histórico de usuário nem segredos.
