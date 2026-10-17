# VANO V2.3 — Refinamento de boas-vindas e contas

- Substituída a hero ilustrada grande da primeira tela por uma composição editorial mobile-first.
- Inserida a marca VANO da Biblioteca do usuário, otimizada como `/vano-logo-original.webp` (ícone original sem redesenho).
- Novo wordmark VANO / MAPS e favicon/touch icon com marca original.
- Reformuladas `/inicio`, `/entrar` e `/cadastro` com CSS escopado em `src/entry-v3.css`.
- Removido o botão Google temporário, mantido login/cadastro e criação de sessão local.
- Adicionado splash curto, uma vez por aba, que respeita `prefers-reduced-motion`.
- Alterado `/` para mostrar boas-vindas para visitantes e o mapa para usuários logados.
- Mantida `OnboardingPage` ilustrada anterior e todas as funcionalidades existentes de mapa, perfil, rotas e backend.
- Para testar, abra `http://localhost:5174/inicio` e em seguida `/entrar` e `/cadastro`.
- **Pacote não contém `.env` e `data/store.json`**; atualizar por cima preserva sua configuração e dados locais.
- Google OAuth, build Vite neste ambiente e revisão visual no navegador Zorin não foram validados nesta execução.
