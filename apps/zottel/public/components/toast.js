'use strict';
window.Toast = {
  show(msg, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind === 'error' ? 'error' : kind === 'success' ? 'success' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3500);
  },
  error(msg)   { this.show(msg, 'error'); },
  success(msg) { this.show(msg, 'success'); },
};
