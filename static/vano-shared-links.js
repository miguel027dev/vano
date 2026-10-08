(() => {
  const root = document.querySelector('[data-shared-links]');
  if (!root) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || document.querySelector('input[name="csrf_token"]')?.value;
  async function load() {
    try {
      const response = await fetch('/api/shared-routes', {cache:'no-store'});
      if (!response.ok) throw new Error();
      const data = await response.json();
      root.replaceChildren();
      for (const item of data.routes || []) {
        const row = document.createElement('div'); row.className = 'shared-link-row';
        const label = document.createElement('span'); label.textContent = `${item.destination_label || 'Rota'} · expira ${new Date(item.expires_at).toLocaleString('pt-BR')}`;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = 'Revogar link';
        button.addEventListener('click', async () => {
          button.disabled = true; button.textContent = 'Revogando…';
          try {
            const result = await fetch(`/api/shared-route/${encodeURIComponent(item.token)}/revoke`, {method:'POST', headers:{'X-CSRF-Token':csrf}});
            if (!result.ok && result.status !== 404) throw new Error();
            await load();
          } catch (_) { button.disabled = false; button.textContent = 'Tentar revogar novamente'; }
        });
        row.append(label, button); root.append(row);
      }
      if (!root.childElementCount) root.textContent = 'Nenhum link ativo.';
    } catch (_) { root.textContent = 'Não foi possível carregar os links. Recarregue a página para tentar novamente.'; }
  }
  load();
})();
