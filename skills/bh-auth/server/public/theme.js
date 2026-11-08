// Vor dem ersten Zeichnen, damit die Seite nicht kurz im falschen Design aufblitzt.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('bh-theme'); } catch (e) { /* privater Modus */ }
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
