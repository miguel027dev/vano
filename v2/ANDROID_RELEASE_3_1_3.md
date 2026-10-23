# Android 3.1.3 — entrada e origem autorizada

O serviço `vanu` usa o domínio público `https://vanomaps.online`, enquanto o Android carrega `https://vanu-73xu.onrender.com`. A validação anterior aceitava somente o primeiro e rejeitava login e cálculo de rota no aplicativo.

Configure no serviço vanu:

```env
VANO_ADDITIONAL_ORIGINS=https://vanu-73xu.onrender.com
```

A origem principal e o callback Google permanecem configurados como antes. A lista adicional aceita somente origens HTTPS exatas; sites externos, origem opaca e requisições cross-site continuam bloqueados. Cookies e CSRF continuam obrigatórios.

O Android abre `/mapa`, inclusive após restaurar a antiga tela Início e após login Google. O frontend também direciona a raiz para o mapa em hosts Android antigos. Login por senha no aplicativo termina no mapa, sem obrigar a personalização inicial.

Pacote Play: `com.vano.maps`, versão 3.1.3, versionCode 20270004, minSdk 24, targetSdk 36. A assinatura usa variáveis VANO_UPLOAD_KEYSTORE e VANO_UPLOAD_PASSWORD_FILE; nenhuma chave ou senha deve ser incluída no projeto.

Validação: 880 testes; build web; APK/AAB release; lint Android sem erros; auditoria npm sem vulnerabilidades reportadas. Validação de OAuth de ponta a ponta, GPS e navegação ainda exige aparelho Android.
