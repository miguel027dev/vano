# Comparador privado GeoSampa

As seis fontes são consultadas apenas por administradores no painel `/admin`, com `VANO_SAFE_ROUTING_TEST_MODE=true`. `VANO_SAFE_ROUTING_ENABLED=false` preserva a seleção original do provedor. Não se trata de um ranking de segurança aprovado.

## Carga

`SAFE_ALLOW_B2_UPLOAD=1 node --max-old-space-size=4096 scripts/safe-routing/build-context-grid.mjs roads sidewalks busLanes hydrologicalRisk floodHistory`

Exige as credenciais B2 já utilizadas pelo arquivo privado. Nunca gravar chaves no Git. A carga usa páginas de 500 feições, quatro requisições simultâneas, reconcilia contagem e IDs, isola erros conhecidos de geometria e só publica `index.json` ao final. Cada bundle é lido de volta antes da publicação. Erros interrompem a camada; não promover um prefixo incompleto.

`VANO_SAFE_B2_CONTEXT_GRIDS` contém um JSON com cinco chaves: `roads`, `sidewalks`, `busLanes`, `hydrologicalRisk`, `floodHistory`, cada qual com o snapshot completo correspondente. O índice de iluminação continua em `VANO_SAFE_B2_LIGHTING_GRID`.

## Consulta e limites

Até quatro geometrias reais, 20 km de extensão, união de 25 áreas de 0,02°, 150 mil feições, 50 MB comprimidos por consulta de contexto, deadline de rede de 25 s, um comparador em andamento por instância e duas chamadas/minuto por limite administrativo. Cache privado de até 40 MB/150 entradas/5 minutos. A leitura por intervalo exige HTTP 206, Content-Range exato, tamanho e SHA-256; arquivos não conferidos são recusados.

Proximidades: via 25 m, calçada 20 m, faixa de ônibus 12 m, histórico de alagamento 50 m, polígono hidrológico 0 m. Amostras a cada 50 m não equivalem a uma inspeção contínua; podem perder feições pequenas entre amostras. Associação à via, condição da calçada e funcionamento dos postes não são confirmados. Datas e horários oficiais são informativos, sem interpretar/inventar restrições legais. Histórico não é previsão de alagamento atual. Não usar atributos pessoais ou demográficos.

## Recuperação

Desativar `VANO_SAFE_ROUTING_TEST_MODE` retira o comparador sem alterar o roteador. Para retornar à versão anterior de dados, restaurar os IDs anteriores das variáveis. Nenhum snapshot anterior é excluído automaticamente. Manter controle das cotas B2 e não reexecutar cargas completas sem necessidade. Aprovação de licença e validação operacional continuam obrigatórias antes de um lançamento público ou ranking automático.
