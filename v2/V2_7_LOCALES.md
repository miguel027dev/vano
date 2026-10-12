# VANO V2.7 — Idioma automático e escolha da rota

Esta atualização altera somente o idioma inicial/cadastro e o visual do passo de preferência de rota. Nenhum banco, token, credencial ou `.env` é enviado no ZIP.

## Comportamento

- País **FR** reconhecido por cabeçalho GeoIP de um proxy confiável → `fr-FR`.
- País **PT** → `pt-PT`. País **BR** → `pt-BR`. País **US/GB** (e outros anglófonos) → `en-US`.
- Sem cabeçalho de país válido: o cliente usa primeiro o fuso horário conhecido do dispositivo (por exemplo, `Europe/Paris`, `Europe/Lisbon`, `America/Sao_Paulo`); se o fuso não for reconhecido, usa o idioma preferido do navegador.
- **Não solicita GPS nem localização exata** para definir idioma.
- No cadastro, **Idioma do aplicativo** é pré-selecionado, mas pode ser alterado. A preferência é gravada na conta e não muda se a pessoa viajar.
- Também é possível mudar de idioma em **Configurações** após criar a conta. Visitantes que escolhem manualmente têm a preferência persistida.
- Contas antigas sem escolha manual de idioma podem usar a detecção nova; a V2.6 não oferecia escolha de idioma, portanto `pt-BR` salvo antes não é considerado confirmação manual.
- Traduções cobrem entrada, login, cadastro, recuperação, personalização, mapa e controles principais, perfil e configurações. Algumas páginas informativas e legais provisórias ainda estão em português; revisão jurídica de tradução é requisito antes da publicação internacional.

## GeoIP no deploy

**Não confie em cabeçalhos enviados diretamente pela internet.** Se estiver atrás de um proxy/CDN que **remove e sobrescreve** `CF-IPCountry` (Cloudflare) ou `X-Vercel-IP-Country` (Vercel), defina no ambiente do backend:

```dotenv
VANO_TRUST_GEO_HEADERS=1
```

Caso contrário, mantenha essa variável **desativada** (padrão) e aceite o idioma/fuso do navegador como sugestão. Nenhuma API de geolocalização por IP é chamada pelo aplicativo: não é necessário enviar o IP do visitante a um serviço de terceiros para escolher o idioma.

No Zorin via Wi-Fi, sem proxy GeoIP, a escolha depende do fuso/idioma do aparelho e pode ser alterada no cadastro.

## Design

A etapa **Qual caminho combina com você?** agora mostra duas opções horizontais discretas com ícone, descrição curta e marca de seleção. Menos altura, borda fina, contraste alto, foco visível, animações suaves e `prefers-reduced-motion` respeitado. O valor salvo segue sendo `safe` ou `fast`, sem alteração do algoritmo V1.

## Validação

Execute:

```bash
npm install --no-audit --no-fund
npm run test
npm run build
bash iniciar-v2.sh --rede
```

O ZIP sobrepõe apenas o código: mantenha `.env` e `data/` existentes. Para acesso pelo celular, use o IP/URL que o script exibir. GPS no IP HTTP do celular ainda requer HTTPS confiável; idioma não depende de GPS.
