'use strict';
/** The figure: a shaggy fringe with eyes peeking out. Drawn from a seed, so it is identical everywhere. */
window.ZottelFigure = (() => {
  const LOOK = { idle: [0, 3], look: [5, 2], think: [-3, -5], happy: [0, 0], sleepy: [0, 5], error: [0, 4] };
  const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const strand = (x, y, len, w, sway, cls) => `<path class="${cls}" d="M${x - w} ${y}C${x - w + sway * 0.4} ${y + len * 0.4} ${x - w + sway} ${y + len * 0.7} ${x + sway} ${y + len}C${x + w + sway * 0.8} ${y + len * 0.7} ${x + w + sway * 0.3} ${y + len * 0.4} ${x + w} ${y}Z"/>`;

  function eyes(mood) {
    return [[76, 106, 8], [124, 105, 6.5]].map(([x, cy, pupil]) => {
      if (mood === 'happy') return `<path class="zf-smile" d="M${x - 13} ${cy + 3}Q${x} ${cy - 13} ${x + 13} ${cy + 3}"/>`;
      const [dx, dy] = LOOK[mood] || LOOK.idle;
      const lid = mood === 'sleepy' ? `<rect class="zf-body" x="${x - 17}" y="${cy - 17}" width="34" height="17"/>` : '';
      return `<g class="zf-eye"><circle class="zf-white" cx="${x}" cy="${cy}" r="16"/><circle class="zf-pupil" cx="${x + dx}" cy="${cy + dy}" r="${pupil}"/><circle class="zf-white" cx="${x + dx + 2.5}" cy="${cy + dy - 2.5}" r="2.2"/></g>${lid}`;
    }).join('');
  }

  function html(mood = 'idle') {
    const r = seeded(11); let back = ''; let front = '';
    for (let i = 0; i < 17; i++) { const t = i / 16; back += strand(34 + t * 132, 58 - Math.sin(Math.PI * t) * 26, 108 + r() * 26, 7 + r() * 6, (r() - 0.5) * 22, 'zf-deep'); }
    for (let i = 0; i < 11; i++) { const t = i / 10; front += strand(48 + t * 104, 54 - Math.sin(Math.PI * t) * 18, 40 + r() * 24, 7 + r() * 5, (r() - 0.5) * 16, 'zf-light'); }
    return `<svg class="zf zf--${mood}" viewBox="0 0 200 200" aria-hidden="true"><ellipse class="zf-deep" cx="100" cy="72" rx="68" ry="34"/><g class="zf-back">${back}</g><ellipse class="zf-body" cx="100" cy="104" rx="62" ry="50"/>${eyes(mood)}<g class="zf-fringe"><ellipse class="zf-light" cx="100" cy="62" rx="56" ry="30"/>${front}<path class="zf-light" d="M46 60C42 86 46 106 52 128C59 106 62 84 66 60Z"/><path class="zf-light" d="M140 56C147 76 149 98 143 118C136 100 134 78 132 56Z"/></g></svg>`;
  }

  return { html };
})();
