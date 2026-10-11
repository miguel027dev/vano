/* Embedded social browsers isolate Google accounts and GPS permission. */
(() => {
  const embedded = /Instagram|FBAN|FBAV|FB_IAB/i.test(navigator.userAgent || '');
  if (!embedded) return;
  document.querySelectorAll('[data-google-auth]').forEach(link => {
    const note = document.createElement('div');
    note.className = 'vano-external-auth-tip';
    note.setAttribute('role', 'note');
    const text = document.createElement('p');
    text.textContent = 'Você está no navegador do Instagram. Para escolher suas contas Google e manter a permissão de localização, abra o VANO no Chrome ou Safari.';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copiar link para abrir no navegador';
    copy.addEventListener('click', async () => {
      const url = new URL(location.href);
      url.hash = '';
      try {
        await navigator.clipboard.writeText(url.toString());
        copy.textContent = 'Link copiado! Cole no Chrome ou Safari.';
      } catch (_) {
        const manual = document.createElement('input');
        manual.type = 'text';
        manual.readOnly = true;
        manual.value = url.toString();
        manual.setAttribute('aria-label', 'Link do VANO para copiar');
        note.append(manual);
        manual.focus();
        manual.select();
        copy.textContent = 'Selecione o link e copie';
      }
    });
    note.append(text, copy);
    link.insertAdjacentElement('afterend', note);
  });
})();
