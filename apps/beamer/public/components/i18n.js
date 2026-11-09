'use strict';
/**
 * i18n for Beamer (DE/EN). One catalog per language (public/i18n/<lang>.json).
 * Components call BeamerI18n.t("namespace.key", { vars }) at RENDER time, the catalog is only there after load().
 *   t(key, vars)  translated string, plural via { one, other } + vars.count, fallback: the key itself
 *   load(lang)    loads the catalog and sets the locale     lang()/locale()  current language / Intl locale
 * Integration: after /api/me and before the first render await BeamerI18n.load(lang); all visible texts via t().
 */
window.BeamerI18n = (function () {
  var LOCALES = { de: 'de-DE', en: 'en-US' };
  var _msgs = {}, _lang = 'de', _locale = 'de-DE';

  function _get(key) {
    var parts = String(key).split('.'), o = _msgs;
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function _interp(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return (vars && vars[k] != null) ? vars[k] : m; });
  }
  function t(key, vars) {
    var v = _get(key);
    if (v == null) return key;
    if (typeof v === 'object') { var n = vars && vars.count; v = (n === 1 ? v.one : v.other) || v.other || v.one; }
    return _interp(v, vars);
  }
  function load(lang) {
    _lang = (lang === 'en') ? 'en' : 'de'; _locale = LOCALES[_lang] || 'de-DE';
    var base = window.APP_BASE || '';
    return fetch(base + '/i18n/' + _lang + '.json', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (m) { _msgs = m || {}; return _msgs; })
      .catch(function () { _msgs = {}; return _msgs; });
  }
  return { t: t, load: load, lang: function () { return _lang; }, locale: function () { return _locale; } };
})();
