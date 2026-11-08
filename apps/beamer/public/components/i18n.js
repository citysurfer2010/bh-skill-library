'use strict';
/**
 * i18n für Beamer (DE/EN). Ein Katalog je Sprache (public/i18n/<lang>.json).
 * Komponenten rufen BeamerI18n.t("namespace.key", { vars }) zur RENDER-Zeit auf, der Katalog ist erst nach load() da.
 *   t(key, vars)  übersetzter String, Plural über { one, other } + vars.count, Fallback: der Key selbst
 *   load(lang)    lädt den Katalog und setzt die Locale     lang()/locale()  aktuelle Sprache / Intl-Locale
 * Einbau: nach /api/me und vor dem ersten Render await BeamerI18n.load(sprache); alle sichtbaren Texte über t().
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
