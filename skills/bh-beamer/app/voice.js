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

// Test: can the app hear the remote's microphone on its own? Measures the loudness for 5 seconds, sends no audio anywhere.
window.BHMicTest = function (done) {
  var peak = 0; var frames = 0;
  function finish(state) { window.BH_MICTEST = state + '-peak' + Math.round(peak * 1000) + '-f' + frames; done(window.BH_MICTEST); }
  try {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var AC = window.AudioContext || window.webkitAudioContext; var ctx = new AC(); var src = ctx.createMediaStreamSource(stream);
      var an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an); var buf = new Float32Array(an.fftSize);
      var t = setInterval(function () { an.getFloatTimeDomainData(buf); frames++; for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i]); if (v > peak) peak = v; } }, 100);
      setTimeout(function () { clearInterval(t); stream.getTracks().forEach(function (tr) { tr.stop(); }); try { ctx.close(); } catch (e) { /* old engine */ } finish('ok'); }, 5000);
    }, function (e) { window.BH_MICTEST = 'denied-' + e.name; done(window.BH_MICTEST); });
  } catch (e) { window.BH_MICTEST = 'ex-' + e.name; done(window.BH_MICTEST); }
};
