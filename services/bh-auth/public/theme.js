// Before the first paint, so that the page does not flash briefly in the wrong theme.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('bh-theme'); } catch (e) { /* private mode */ }
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
