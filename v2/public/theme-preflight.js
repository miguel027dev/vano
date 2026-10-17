/* Leitura visual somente: a preferência oficial continua vindo de /api/bootstrap. */
(function () {
  try {
    var theme = window.localStorage.getItem('vano-boot-theme');
    if (theme !== 'dark' && theme !== 'light' && theme !== 'system') return;
    var systemDark = theme === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = theme === 'dark' || systemDark ? 'dark' : 'light';
  } catch {
    /* Armazenamento bloqueado: seguir com o tema padrão, sem interromper a tela. */
  }
}());
