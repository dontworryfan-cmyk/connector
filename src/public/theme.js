(function initTheme() {
  const root = document.documentElement;
  const storageKey = 'connector-theme';
  const saved = localStorage.getItem(storageKey);

  if (saved === 'light' || saved === 'dark') {
    root.dataset.theme = saved;
  }

  const toggle = document.getElementById('theme-toggle');
  if (!toggle) {
    return;
  }

  toggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem(storageKey, next);
  });
})();
