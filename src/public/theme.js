(function setTheme() {
  const saved = localStorage.getItem('connector-theme');
  const root = document.documentElement;
  if (saved === 'dark' || saved === 'light') {
    root.dataset.theme = saved;
  }

  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('connector-theme', root.dataset.theme);
  });
})();
