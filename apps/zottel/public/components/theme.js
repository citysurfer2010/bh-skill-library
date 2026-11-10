'use strict';
window.Theme = {
  get() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; },
  toggle() {
    const next = this.get() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('bh-theme', next); } catch {}
    document.dispatchEvent(new Event('bh-theme-change'));
    return next;
  },
};
