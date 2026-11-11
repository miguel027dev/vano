# VANO V2.8 — animações de navegação + Google OAuth

## Corrigido

- O botão Google fica visível e explica quando as credenciais não foram configuradas **neste serviço**. Não apresenta uma integração inexistente como se estivesse ativa.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` são variáveis de **backend**, não são embutidas no bundle React. O callback do staging deve ser `https://vano-v2-7-staging.onrender.com/api/auth/google/callback` e precisa ser autorizado no Google Cloud.
- Usuários com conta de senha já existente podem entrar e vincular a identidade Google com o MESMO e-mail em `/conta`. O servidor vincula somente após conferir sessão autenticada, state, PKCE e identificador Google não vinculado a outra conta.
- O mapa desenha um **veículo com rotação suave**, interpola posições entre pontos da rota, acompanha curvas, atualiza o texto do próximo cruzamento e mostra indicação de faixas apenas quando Mapbox retorna dados reais sobre faixas.
- Navegação GPS e **prévia simulada** são modos claramente separados; a prévia acelerada mostra o carro percorrendo a geometria mesmo sem GPS, com aviso visível de que NÃO representa localização real nem instruções para dirigir. Não grava viagens simuladas no histórico.
- Evento de rotação programática do mapa não cancela mais o acompanhamento automático como gesto de usuário.
- `prefers-reduced-motion` reduz animações e mantém orientação acessível.

## Bloqueios externos restantes

- As credenciais Google do serviço principal NÃO são compartilhadas automaticamente com o novo `vano-v2-7-staging`. A API Render usada pela integração permite **escrever** variáveis no novo serviço, mas não ler/transferir valores já existentes. É necessário informar os valores pelo Render Dashboard, sem inserir segredos no GitHub nem neste chat.
- A API `/api/health` informa `googleReady`, `mapboxConfigured`, e `v1BridgeConfigured`. A prévia pode estar `Live` ainda que `googleReady` esteja `false`.
- A prévia no Render Free usa JSON efêmero e não deve ser usada para contas reais. A publicação definitiva exige armazenamento persistente, segurança de produção, rotas V1 integradas e validações adicionais.
- Animação de prévia não substitui GPS real. Nenhuma orientação de faixa é inventada quando o provedor não forneceu as informações.
