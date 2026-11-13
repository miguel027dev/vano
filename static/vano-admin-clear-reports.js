(() => {
  document.querySelectorAll('[data-admin-clear-map-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const answer = window.prompt(
        'Isso removerá todas as ocorrências comunitárias ativas dos mapas para todos os usuários. Radares e histórico serão preservados.\n\nDigite LIMPAR para confirmar:'
      );
      if (!answer || answer.trim().toUpperCase() !== 'LIMPAR') {
        event.preventDefault();
        return;
      }
      const confirmation = form.querySelector('[name="confirmation"]');
      if (!confirmation) {
        event.preventDefault();
        return;
      }
      confirmation.value = 'LIMPAR';
    });
  });
})();
