# VANO /mapa — Câmera de aproximação em conversões

**Branch:** feature/maneuver-focus-camera-20261022
**Escopo:** navegação com carro/moto no mapa. O modo experimental /v2 não usa essa política.

## Problema
Antes, buildCameraTarget subtraía turnOpen quando detectava uma manobra, abrindo o enquadramento. O limite final de zoom impedia a câmera de aproximar além do valor padrão.

## Implementação
1. cameraManeuverFocus identifica conversões simples declaradas pelos passos e confirma a geometria esquerda/direita real; não interfere em rotatórias ou bifurcações.
2. Pré-aproximação até 300m: mantém enquadramento de cruzeiro sem zoom-out temporário.
3. Foco começa na distância ajustada à velocidade: clamp(72 + 8.5*velocidade_m_s, 95, 260) metros; smoothstep gradual.
4. Aumenta zoom até +0,62 nível em relação à base, com redução da força em velocidades mais altas e conversões próximas em sequência.
5. Inclinação sobe progressivamente, preservando visibilidade quando há prédios densos.
6. Retém o foco até 950ms depois de concluir a entrada; invalida retenção ao recalcular rota.
7. A interpolação de cameraMotionTick permanece dona da câmera; nenhuma chamada nova ao servidor ou ciclo de animação independente.

## Arquivos
- static/vano-map.js: cálculo de foco, zoom, pitch e limites por veículo.
- tests/camera_maneuver_focus_contract.cjs: simulações determinísticas das transições.
- tests/ux_lifecycle_contract.cjs: contrato de máximos de zoom atualizado.

## QA e liberação
- Sintaxe JavaScript dos arquivos alterados: verificada.
- Helper real extraído do código: simuladas aproximação, direita/esquerda, pós-curva, rota inconsistente e troca de rota.
- Pendente: rodar a suíte integral e validar visualmente em WebView Android real.
- Cobrir semáforos, duas curvas consecutivas, rotatórias, acesso de avenida, FPS, GPS ruim e UI sobreposta.
- A operação pode ser revertida por rollback dos commits de câmera; roteamento e APIs de tráfego não foram modificados.
