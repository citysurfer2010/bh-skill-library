// Voice: the Tizen voice control (from Tizen 4.0) hears registered phrases; here the album names, the years and "Alle Alben".
// Free dictation is not possible on Tizen 5.5. Deliberately old JavaScript.
window.BHVoice = (function () {
  'use strict';
  var client = null; var last = ''; var onHeard = function () {};
  function report(what) { try { window.BH_VOICE_STATE = what; } catch (e) { /* only for the access log */ } }
  function start() {
    if (client) return true;
    try {
      client = tizen.voicecontrol.getVoiceControlClient();
      client.addResultListener(function (event, commands, text) {
        report('res-' + event);
        if (event === 'SUCCESS' && text) onHeard(String(text));
      });
      report('ready');
      return true;
    } catch (e) { report('err-' + e.name); client = null; return false; }
  }
  function setPhrases(list) {
    if (!start()) return;
    var key = list.join('|'); if (key === last) return; last = key;
    try {
      client.setCommandList(list.map(function (t) { return new tizen.VoiceControlCommand(t, 'FOREGROUND'); }), 'FOREGROUND');
      report('cmds-' + list.length);
    } catch (e) { report('cmderr-' + e.name); }
  }
  return { setPhrases: setPhrases, onHeard: function (fn) { onHeard = fn; } };
})();
