# VANO Android — VANU

Aplicativo Android que carrega a aplicação remota de https://vanu-73xu.onrender.com/mapa.
Android 6 ou superior. O pacote com.vano.maps.vanu instala separadamente de versões antigas do VANO.

## Arquitetura
Uma Activity e uma WebView com aceleração de hardware. Interface, mapa, autenticação e rotas são fornecidos pelo VANU. O host adiciona localização, compartilhamento, retorno do login Google, tratamento do botão Voltar e abertura sincronizada com a renderização do mapa.
As alterações em v2 do servidor preservam o MapPage ao navegar entre telas. O mapa fica invisível e inativo, mas continua montado; GPS e animações são suspensos fora do mapa. A troca de conta limpa esse estado. A Activity preserva a WebView nas rotações e em retornos do segundo plano; o Android ainda pode encerrar o processo em condições de pouca memória.
A primeira abertura precisa baixar e inicializar o mapa. Não há promessa de carregamento instantâneo ou de navegação completa offline. O cache HTTP segue os cabeçalhos do servidor.

## Compilar
Instale JDK 17 e Android SDK 35. Configure ANDROID_HOME e execute ./gradlew :app:assembleRelease. O resultado sem chave é app/build/outputs/apk/release/app-release-unsigned.apk.
Para atualizações do APK entregue, assine com a mesma chave fornecida separadamente; nunca faça commit dessa chave nem da senha. O APK entregue usa assinatura própria para instalação direta, não a chave de publicação existente na Play Store.

## Integração do servidor
A versão do VANU deve incluir src/lib/nativeShell.js, retenção do mapa em App.jsx e server/mobile-auth.mjs. O login Google usa o navegador padrão e retorna por vano-vanu://auth/callback, com código de uso único protegido por PKCE. O código não é uma sessão e expira em 2 minutos; a requisição OAuth expira em 10 minutos.
A origem de mensagens nativas é restrita ao VANU e ao frame principal. Links externos abrem no navegador; HTTP misto e erros TLS são bloqueados.

## Verificações
Build release, lint de release e assinatura validados. Testes da API e do retorno PKCE aprovados. Teste React confirmou que o mapa é preservado entre telas e reinicia ao trocar de conta. Nenhum aparelho ou emulador Android estava conectado; GPS, desempenho e login com credenciais reais ainda precisam de validação num celular.
