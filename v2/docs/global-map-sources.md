# VANO — Mapa de informações públicas (primeira integração global)

## Conectores reais

| Fonte | Alcance | Status | Uso no VANO |
|---|---|---|---|
| [OpenStreetMap / Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) | Mundial, preenchimento desigual | **Operacional: consultas pequenas com cache** | Radares fixos cadastrados, semáforos, lombadas, placas, cruzamentos ferroviários, travessias, obras, hospitais, saúde, bombeiros, bases policiais fixas, combustível, recarga e estacionamento |
| [Overture Maps Places](https://docs.overturemaps.org/guides/places/) | Mundial, versões mensais | Catalogado, **não conectado** | Futuro ETL/GeoParquet para POIs e serviços com filtros de qualidade |
| [Overture Maps Transportation](https://docs.overturemaps.org/guides/transportation/) | Mundial, versões mensais | Catalogado, **não conectado** | Futuro ETL de atributos da infraestrutura viária |
| Bases viárias oficiais por país/cidade | Regional, depende do governo local | **Não conectadas** | Futuras integrações específicas após análise de licença, formato, atualização e georreferenciamento |
| Comunidade VANO | Somente relatos criados por usuários | **Somente registros com status verificado** | Acidentes, trânsito, obras e riscos reportados; não misturar com dados OSM |

## O que o motor efetivamente consulta

Endpoint `GET /api/map-features?bbox=west,south,east,north`.

- Rejeita áreas com largura acima de 0,065° ou altura acima de 0,055°.
- Consulta apenas o enquadramento de mapa, com zoom >= 13,6 (modo mapa e navegação), sem coletar o planeta inteiro.
- Cache 5 minutos por célula geográfica e orçamento máximo por processo de 2.400 chamadas upstream a cada 24 horas.
- Máximo de três operações na fila e ritmo mínimo de 1,5 segundos por chamada ao serviço comunitário.
- Timeout de 12,5 segundos, fallback sem pontos falsos, sem alegar completude.
- Até 180 registros públicos por área, ordenados para mostrar **radar fixo**, avisos e sinalização antes de serviços.
- As informações são cadastros cartográficos e **não garantem** que cada radar, sinal, obra ou ponto de serviço ainda exista. Nunca tratá-las como confirmação em tempo real.
- Relatos só entram com status `verificado`, dentro da área e criados nos últimos 14 dias; localização já é aproximada. Não são feitas inferências de presença policial móvel.
- Sem cache de localização pessoal; o backend guarda apenas resultado de consultas espaciais agregadas, sem coordenadas exatas do usuário.
- Ícones são selecionados pela posição visível da câmera, limitados a 55 pins, com área interativa de 44 px, tamanho visual menor, sem animações independentes do GPS.
- Crédito visível: **© OpenStreetMap contributors · ODbL**, com link para [informações de licença](https://www.openstreetmap.org/copyright). Não redistribuir conjuntos derivados sem atender à ODbL.

## Operação responsável

O Overpass público é hospedado pela comunidade e seu próprio manual alerta que aplicativos com muitos usuários devem **hospedar uma instância própria ou importar extratos do OSM**. Para lançamento global em escala, implementar armazenamento espacial próprio, sincronizar extratos regionais e medir qualidade por país. Nunca anunciar cobertura garantida de radares globais com essa única fonte.

Para auditoria do status da integração: `GET /api/map-features/sources`. Itens `active:false` são somente catálogo de fontes potenciais, não conectores habilitados.

As placas reais continuam tendo precedência sobre qualquer aviso do aplicativo; atenção à legislação local de alertas de fiscalização. O sistema não serve como ferramenta para evitar a aplicação das leis de trânsito.
