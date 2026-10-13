# VANO Android — VANU 3.1

WebView Android 6+ que carrega https://vanu-73xu.onrender.com/mapa. Pacote com.vano.maps.vanu; atualização assinada com a mesma chave da entrega 3.0.

## Continuidade offline
Prepare o trajeto conectado. O Android salva os recursos públicos do mapa e as peças ao redor da linha percorrida, em armazenamento privado limitado a 256 MiB. O início aguarda o preparo por até 3 minutos; um download incompleto é informado. Nenhuma resposta de autenticação/API é salva no cache HTTP nativo.
A página salva conta sem credenciais/CSRF ou privilégios administrativos offline, preferências, favoritos e trajeto ativo em IndexedDB. Ao reabrir, o trajeto da mesma conta pode ser retomado por até 24 horas; a posição salva nunca vale como GPS atual.
GPS local alimenta as instruções mesmo sem rede. A voz usa somente vozes embarcadas instaladas no Android, com preferência pelo idioma escolhido. O botão de som interrompe a fala. Sinal antigo/inexato não gera orientação fictícia. Um túnel pode bloquear tanto internet quanto GPS; neste caso é mantida a última posição e a voz aguarda uma nova localização confiável.
Nova rota, recálculo, busca, alertas públicos e alterações da conta precisam de internet. O mapa salvo cobre o corredor preparado, não todo o país. GPS e voz funcionam com o aplicativo em primeiro plano; ainda não há serviço de navegação com tela bloqueada/segundo plano. Há limite de distância/peças/espaço; trajetos longos podem resultar em preparo parcial.

## Sessões e servidor
Cookies privados são gravados ao concluir o login e ao sair do primeiro plano. Sessões no servidor duram 90 dias, renovadas durante o uso; entrar em outro aparelho não derruba a sessão atual. Sair revoga somente aquela sessão, e troca de senha revoga as sessões conforme as regras de segurança. Fechar o aplicativo preserva o login. Isso exige o armazenamento PostgreSQL persistente já adotado pelo VANU.
Uma Activity/WebView preserva o mapa entre telas, suspende a renderização quando oculto e usa transição após o primeiro frame. Durante um trajeto, GPS e instruções continuam também nas telas internas. O processo pode ser encerrado pelo Android; a retomada depende dos arquivos salvos.
Google abre no navegador padrão, retorna por vano-vanu://auth/callback e troca um código curto de uso único com PKCE. HTTPS e origem do frame principal são obrigatórios; erros TLS são bloqueados.

## Compilar e verificar
Use JDK 17 e SDK 35. Execute `./gradlew :app:assembleRelease :app:lintRelease`. Assine app/build/outputs/apk/release/app-release-unsigned.apk com a chave entregue separadamente. Nunca publique a chave/senha.
No diretório v2, `npm test` e `npm run build` verificam integração, sessões, rotas, GPS e armazenamento. Os testes de cache nativo em tests/offline-cache usam JDK e org.json:json:20250107; as classes android desse diretório são dublês de teste e não entram no APK. Verificam persistência após reinício sem rede, exclusão da API, separação por token, HTTPS, cabeçalhos e limites de download.
Compilação, lint, assinatura, cache e integração React foram verificados. Nenhum aparelho/emulador Android estava conectado: fala real, GPS em estrada, modo avião, consumo de bateria e fluidez em dispositivo precisam de validação no celular.
