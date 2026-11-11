# VANO V2.9 — GPS, marcador 3D, camadas e Google em destaque

- **GPS:** watchPosition mantém fix atualizado com mapa aberto, mesmo antes do começo do trajeto. Falha temporária posterior não derruba fix válido recente; novo pedido evita sobreposição e reutiliza GPS obtido segundos antes. Nunca apresenta coordenadas simuladas como GPS.
- **Marcador de direção:** SVG vetorial exclusivo VANO, com face laranja em gradiente, borda alta, sombra e bússola sutil; mesma geometria para carro e moto, gira conforme bearing real/simulado, respeita movimento reduzido.
- **Camadas:** alternância Mapbox ruas/satélite sem aguardar evento de carregamento que pode não ocorrer; redesenha overlays a cada style.load. Fallback Leaflet usa World Imagery verdadeiro, com atribuição.
- **Conta:** Google como primeira ação no login e registro, visual multicolorido próprio e formulário por senha como alternativa. Se o serviço não tiver GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET, o botão é honestamente desativado, com orientação. Segredos não entram no repositório.
- **Integração:** nenhum serviço de produção, banco ou branch main alterados; testar staging no Render e em Android/iOS real.
