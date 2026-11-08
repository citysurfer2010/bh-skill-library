// Suchlogik der App-Uebersicht, ohne DOM und ohne Netz.
//   rank(modules, apps, query, limit) -> { modules: [...], top: { type, id, url } | null }
(function () {
  'use strict';
  var MIN_CHARS = 2;
  var APP_BONUS = 10; // genau getippter App-Name schlaegt ein Modul mit gleichem Wort

  // translit: ae/oe/ue-Schreibweise, so tippt man ohne Umlaut-Taste. Beide Formen gelten.
  function foldBase(s, translit) {
    var t = String(s == null ? '' : s).toLowerCase().replace(/ß/g, 'ss');
    if (translit) t = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function textScore(f, q) {
    if (!f) return 0;
    if (f === q) return 100;
    if (f.indexOf(q) === 0) return 90;
    if ((' ' + f).indexOf(' ' + q) >= 0) return 75;
    return f.indexOf(q) >= 0 ? 55 : 0;
  }

  function wordScore(f, q) {
    return f.split(' ').reduce(function (best, w) { return Math.max(best, textScore(w, q)); }, 0);
  }

  function fields(e, translit) {
    return { label: foldBase(e.label, translit), section: foldBase(e.section, translit), app: foldBase(e.appLabel, translit), kw: foldBase(e.kw, translit), desc: foldBase(e.description, translit) };
  }

  // Jedes getippte Wort muss treffen; Titel zaehlt voll, Abschnitt, Stichwort und App weniger.
  function scoreVariant(f, tokens, isApp) {
    var sum = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var s = Math.max(textScore(f.label, t), textScore(f.section, t) * 0.55, wordScore(f.kw, t) * 0.5, textScore(f.app, t) * 0.4, f.desc.indexOf(t) >= 0 ? 20 : 0);
      if (!s) return 0;
      sum += s;
    }
    return sum / tokens.length + (isApp ? APP_BONUS : 0);
  }

  function score(e, q, isApp) {
    return Math.max(scoreVariant(fields(e, false), q.plain, isApp), scoreVariant(fields(e, true), q.translit, isApp));
  }

  function rank(modules, apps, query, limit) {
    var out = { modules: [], top: null };
    var plain = foldBase(query, false);
    if (plain.length < MIN_CHARS) return out;
    var q = { plain: plain.split(' '), translit: foldBase(query, true).split(' ') };
    var hits = (modules || []).map(function (e, i) { return { s: score(e, q, false), i: i, e: e }; }).filter(function (h) { return h.s > 0; });
    hits.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    out.modules = hits.slice(0, limit || 6).map(function (h) { return h.e; });
    var bestApp = null; var bestScore = 0;
    (apps || []).forEach(function (a) { var s = score(a, q, true); if (s > bestScore) { bestScore = s; bestApp = a; } });
    var bestMod = hits[0];
    if (bestApp && (!bestMod || bestScore >= bestMod.s)) out.top = { type: 'app', id: bestApp.id, url: bestApp.url };
    else if (bestMod) out.top = { type: 'module', id: bestMod.e.id, url: bestMod.e.url };
    return out;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { u = String(u || ''); return (u.charAt(0) === '/' && u.charAt(1) !== '/') || /^https:\/\//.test(u) ? u : '#'; }

  function html(ranked) {
    var list = (ranked && ranked.modules) || [];
    if (!list.length) return '';
    var topId = ranked.top && ranked.top.type === 'module' ? ranked.top.id : null;
    return '<div class="app-search-results-head">Module</div>' + list.map(function (m, i) {
      var where = (m.section ? m.section + ' · ' : '') + (m.appLabel || '');
      return '<a class="app-search-result' + (m.id === topId ? ' is-active' : '') + '" id="appSearchResult' + i + '" role="option" aria-selected="' + (m.id === topId) + '" href="' + esc(safeUrl(m.url)) + '" target="_blank" rel="noopener noreferrer">'
        + '<span class="app-search-result-main"><span class="app-search-result-label">' + esc(m.label) + '</span><span class="app-search-result-path">' + esc(where) + '</span></span><kbd class="app-search-result-hint">Enter</kbd></a>';
    }).join('');
  }

  window.BHModuleSearch = { fold: function (s) { return foldBase(s, false); }, foldTranslit: function (s) { return foldBase(s, true); }, rank: rank, html: html };
})();
