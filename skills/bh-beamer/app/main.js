// Asks the server what to show. Deliberately old JavaScript: the Beamer runs Tizen 5.5.
// Modes: text (title + text), url (full-screen web page, leaves this page), audio (radio/music, played by the app itself).
(function () {
  'use strict';
  var titleEl = document.getElementById('title');
  var textEl = document.getElementById('text');
  var noteEl = document.getElementById('note');
  var player = document.getElementById('player');
  var shownUrl = null;
  var playingUrl = null;
  var shareEl = document.getElementById('share');
  var pc = null;
  var shareSession = null;
  var caps = '';

  var stationEl = document.getElementById('station');
  var frame = document.getElementById('player-frame');
  var vbar = document.getElementById('vbar');
  var shownVideo = null; var vbarTimer = null; var localAt = 0; var failed = false; var barStation = null; var lateTimer = null;
  var playingEl = document.getElementById('playing');
  function audioState(state) { failed = state === 'fail'; playingEl.setAttribute('data-s', state); BHHome.setState(state); }

  function ytCommand(func, args) {
    try { frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (e) { /* not loaded yet */ }
  }
  function showBar(text) {
    vbar.textContent = text; vbar.className = 'on';
    clearTimeout(vbarTimer); vbarTimer = setTimeout(function () { vbar.className = ''; }, 3500);
  }
  function showVideo(id) {
    setView('video');
    if (id === shownVideo) return;
    var first = !shownVideo;
    shownVideo = id;
    if (first && playingUrl) { try { player.pause(); player.removeAttribute('src'); player.load(); } catch (e) { /* no player */ } startWeb(playingUrl); }
    frame.src = window.BH_SCREEN_URL + '/player?v=' + id;
  }
  function stopVideo() {
    if (!shownVideo) return;
    shownVideo = null; frame.src = 'about:blank'; barStation = null;
    stopWeb();
    if (playingUrl) { player.src = playingUrl; var p = player.play(); if (p && p.catch) p.catch(function () {}); }
  }
    function videoVolume() { ytCommand('unMute'); ytCommand('setVolume', [100]); }
  // The Beamer allows only one media player. Alongside the video, the radio therefore runs through Web Audio.
  var web = null; var CHUNK = 64000;
  var RADIO_OVER_VIDEO = 0.4; // Radio quieter, so that the crackling of the fire stays audible
  function stopWeb() {
    if (!web) return;
    web.stop = true;
    try { if (web.abort) web.abort.abort(); } catch (e) { /* already closed */ }
    try { web.reader.cancel(); } catch (e) { /* already closed */ }
    try { web.ctx.close(); } catch (e) { /* already closed */ }
    web = null;
  }
  function playChunk(w, bytes) {
    w.chain = w.chain.then(function () {
      return new Promise(function (done) {
        w.ctx.decodeAudioData(bytes.buffer, function (buf) {
          if (!w.stop) {
            var src = w.ctx.createBufferSource(); src.buffer = buf; src.connect(w.gain);
            var at = Math.max(w.next, w.ctx.currentTime + 0.3);
            src.start(at); w.next = at + buf.duration; w.n++; caps = 'web-' + w.n;
          }
          done();
        }, function () { caps = 'web-decode'; done(); });
      });
    });
  }
  // Cuts at an MP3 frame boundary, so that nothing crackles between the pieces.
  function cutAt(b) { for (var i = b.length - 2; i > b.length - 3000 && i > 0; i--) if (b[i] === 255 && (b[i + 1] & 224) === 224) return i; return b.length; }
  function webFailed(w) { if (w.stop) return; audioState('fail'); noteEl.textContent = 'Stream nicht erreichbar'; showBar('Radio nicht erreichbar'); }
  function startWeb(url) {
    stopWeb();
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { caps = 'web-kein-audio'; return; }
    var w = { ctx: new AC(), next: 0, stop: false, n: 0, chain: Promise.resolve() };
    w.gain = w.ctx.createGain(); w.gain.gain.value = RADIO_OVER_VIDEO; w.gain.connect(w.ctx.destination);
    web = w;
    if (w.ctx.resume) w.ctx.resume();
    var buf = new Uint8Array(CHUNK * 2); var size = 0;
    var ac = window.AbortController ? new AbortController() : null; w.abort = ac;
    fetch(url, ac ? { signal: ac.signal } : {}).then(function (res) {
      if (!res.ok) throw new Error('http');
      w.reader = res.body.getReader();
      function pump() {
        return w.reader.read().then(function (r) {
          if (w.stop) return null;
          if (r.done) { webFailed(w); return null; }
          if (size + r.value.length > buf.length) size = 0;
          buf.set(r.value, size); size += r.value.length;
          if (size >= CHUNK) {
            var view = buf.subarray(0, size); var cut = cutAt(view);
            playChunk(w, view.slice(0, cut));
            var rest = view.slice(cut); buf.set(rest, 0); size = rest.length;
          }
          return pump();
        });
      }
      return pump();
    }).catch(function (e) { if (!w.stop) { caps = 'web-' + e.name; webFailed(w); } });
  }
  window.addEventListener('message', function (e) {
    var d; try { d = JSON.parse(e.data); } catch (x) { return; }
    if (d.event === 'onError') caps = 'yt-error-' + d.info;
    if (d.event === 'onReady' || d.event === 'initialDelivery') videoVolume();
    if (d.event === 'infoDelivery' && d.info && d.info.playerState !== undefined) {
      caps = 'yt-' + d.info.playerState + '-w' + (web ? web.n : 0); videoVolume();
    }
  });
  var view = 'home';
  function setView(name) { view = name; document.body.className = name; }
  function homeView() { setView(playingUrl ? 'home audio' : 'home'); }

  var IDLE_NOTE = '<kbd>CH</kbd> Radio starten'; var paused = null;
  function stopAudio() {
    if (!playingUrl) return;
    playingUrl = null;
    stopWeb();
    stationEl.textContent = 'Radio'; stationEl.className = ''; noteEl.innerHTML = IDLE_NOTE;
    try { player.pause(); player.removeAttribute('src'); player.load(); } catch (e) { /* no player */ }
    BHHome.setPlaying(null);
  }

  function playAudio(url, title, id) {
    paused = null;
    stationEl.textContent = title || '';
    stationEl.className = (title || '').length > 13 ? 'long' : '';
    BHHome.setPlaying(id || null);
    if (url === playingUrl && !failed) return;
    playingUrl = url;
    audioState('load');
    noteEl.textContent = 'Verbinde …';
    if (shownVideo) { startWeb(url); return; }
    player.src = url;
    var p = player.play();
    if (p && p.catch) p.catch(function () { audioState('fail'); noteEl.textContent = 'Wiedergabe nicht möglich'; });
  }

  function sendRequest(kind, id) {
    var x = new XMLHttpRequest();
    x.open('POST', window.BH_SCREEN_URL + '/request');
    x.setRequestHeader('Content-Type', 'text/plain');
    x.send(JSON.stringify({ kind: kind, id: id }));
  }
  // Switch at once; the app learns of it in parallel and shows the same state.
  BHHome.onTune = function (st) { localAt = Date.now(); playAudio(st.url, st.name, st.id); homeView(); sendRequest('radio', st.id); };
  BHHome.onPhotos = function (album) { localAt = Date.now(); setView('photos'); BHPhotos.start(album.id, sendRequest, homeView); };
  BHHome.onMood = function (m) { localAt = Date.now(); showVideo(m.video); videoVolume(); showBar(playingUrl ? 'Radio: ' + stationEl.textContent + ' · CH wechselt' : 'CH ▲ ▼ Radio dazu · Zurück zum Start'); sendRequest('mood', m.id); };
  // The channel rocker on the remote switches stations. The keys must be registered explicitly.
  try { tizen.tvinputdevice.registerKey('ChannelUp'); tizen.tvinputdevice.registerKey('ChannelDown'); } catch (e) { caps = 'ch-' + e.name; }
  // Pause means: really stop the stream and remember the station. OK or the pause key plays it again.
  BHHome.onPause = function () {
    if (playingUrl) {
      var st = { url: playingUrl, name: stationEl.textContent, id: BHHome.currentId() };
      localAt = Date.now(); stopAudio(); paused = st;
      stationEl.textContent = st.name; stationEl.className = st.name.length > 13 ? 'long' : ''; noteEl.innerHTML = '<b>Pausiert</b> <kbd>OK</kbd> Weiter';
      BHHome.setPlaying(st.id); audioState('paused'); homeView(); sendRequest('radiooff', 'x');
    } else if (paused) { var p = paused; paused = null; BHHome.onTune(p); }
  };
  function clearPause() { paused = null; audioState('idle'); stationEl.textContent = 'Radio'; stationEl.className = ''; noteEl.innerHTML = IDLE_NOTE; BHHome.setPlaying(null); }
  try { tizen.tvinputdevice.registerKey('MediaPlayPause'); } catch (e) { /* not every remote has them */ }
  // Test: reports unknown keys in the access log, to find out whether the voice key reaches this app at all.
  document.addEventListener('keydown', function (e) {
    if ([13, 37, 38, 39, 40, 427, 428, 8, 10009, 10252].indexOf(e.keyCode) < 0) caps = 'key-' + e.keyCode;
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 10252 && view.indexOf('home') === 0) { e.preventDefault(); BHHome.onPause(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.keyCode !== 427 && e.keyCode !== 428) return;
    e.preventDefault();
    var dir = e.keyCode === 427 ? -1 : 1;
    if (view === 'photos') { var ps = BHHome.step(dir); if (ps) { localAt = Date.now(); playAudio(ps.url, ps.name, ps.id); BHPhotos.note('Radio: ' + ps.name); sendRequest('radio', ps.id); } }
    else if (view === 'video') { var st = BHHome.step(dir); if (st) { localAt = Date.now(); playAudio(st.url, st.name, st.id); videoVolume(); barStation = st.name; showBar('Radio: ' + st.name); sendRequest('radio', st.id); } }
    else if (view.indexOf('home') === 0) BHHome.channel(dir);
  });
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return; // The menu has already handled the key
    var back = e.keyCode === 10009 || e.keyCode === 8;
    if (back && view === 'photos') { BHPhotos.stop(); homeView(); e.preventDefault(); return; }
    if (view === 'photos') { if (e.keyCode === 13) BHPhotos.togglePause(); else if (e.keyCode === 39) BHPhotos.skip(); else if (e.keyCode === 38) BHPhotos.speed(-1); else if (e.keyCode === 40) BHPhotos.speed(1); else if (e.keyCode === 37) BHPhotos.help(); e.preventDefault(); return; }
    if (back && view === 'video') { localAt = Date.now(); stopVideo(); homeView(); sendRequest('back', 'x'); e.preventDefault(); return; }
    if (back && view.indexOf('home') === 0 && BHHome.back()) { e.preventDefault(); return; }
    if (back && paused && view.indexOf('home') === 0) { clearPause(); e.preventDefault(); return; }
    if (back && (playingUrl || view.indexOf('home') < 0)) { stopShare(); stopAudio(); homeView(); sendRequest('stop', 'x'); e.preventDefault(); return; }
    if (view !== 'video') return;
    if (e.keyCode >= 37 && e.keyCode <= 40) { var st = BHHome.step(e.keyCode === 39 || e.keyCode === 40 ? 1 : -1); if (st) { localAt = Date.now(); playAudio(st.url, st.name, st.id); videoVolume(); barStation = st.name; showBar('Radio: ' + st.name); sendRequest('radio', st.id); } }
    else if (e.keyCode === 13 && playingUrl) { localAt = Date.now(); stopAudio(); videoVolume(); showBar('Radio aus'); sendRequest('radiooff', 'x'); }
  });

  BHHome.onRoomTemp = function (id, value) { sendRequest('temp', id + 't' + (value === 'p' ? 'p' : Math.round(value * 2))); };
  BHHome.isRadioOn = function () { return !!playingUrl; };
  BHHome.onPreview = function (st) { stationEl.textContent = st.name; stationEl.className = st.name.length > 13 ? 'long' : ''; noteEl.textContent = 'Wechsle …'; };

  player.addEventListener('playing', function () { audioState('ok'); noteEl.innerHTML = '<kbd>▲▼</kbd> Sender <kbd>OK</kbd> Pause'; });
  player.addEventListener('waiting', function () { audioState('load'); noteEl.textContent = 'Puffert …'; });
  player.addEventListener('error', function () { if (playingUrl) { audioState('fail'); noteEl.textContent = 'Stream nicht erreichbar'; if (view === 'video') showBar('Stream nicht erreichbar'); } });

  function stopShare() {
    if (!shareSession) return;
    shareSession = null;
    try { pc.close(); } catch (e) { /* already closed */ }
    pc = null;
    shareEl.srcObject = null;
    homeView();
  }

  function attach(stream) {
    shareEl.srcObject = stream;
    var p = shareEl.play();
    if (p && p.catch) p.catch(function (e) { caps = 'play-' + e.name; });
  }

  function sendAnswer(session) {
    if (session !== shareSession || !pc || !pc.localDescription) return;
    var x = new XMLHttpRequest();
    x.open('POST', window.BH_SCREEN_URL + '/answer');
    x.setRequestHeader('Content-Type', 'text/plain');
    x.onload = function () { caps = 'answer-' + x.status; };
    x.onerror = function () { caps = 'answer-netz'; };
    x.send(JSON.stringify({ session: session, sdp: pc.localDescription.sdp }));
  }

  // The Beamer's browser is older than the laptops: it rejects unknown lines as a whole. It cannot resolve
  // mDNS candidates; that does no harm, the laptop reports in at its real address.
  function compatibleSdp(sdp) {
    return sdp.split('\r\n').filter(function (l) { return !/^a=extmap-allow-mixed/.test(l) && !/^a=candidate:.*\.local /.test(l); }).join('\r\n');
  }

  // Without trickle ICE: the answer only goes out once all candidates are in it (after 0.8 s at the latest).
  function startShare(c) {
    stopAudio();
    shareSession = c.session;
    setView('share');
    var PC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    var session = c.session; var sent = false;
    var send = function () { if (!sent) { sent = true; sendAnswer(session); } };
    pc = new PC({ iceServers: [] });
    pc.ontrack = function (e) { if (e.streams && e.streams[0]) attach(e.streams[0]); };
    pc.onaddstream = function (e) { attach(e.stream); };
    pc.onicecandidate = function (e) { if (!e.candidate) send(); };
    pc.oniceconnectionstatechange = function () { if (pc) caps = 'ice-' + pc.iceConnectionState; };
    pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: compatibleSdp(c.offer) }))
      .then(function () { return pc.createAnswer(); })
      .then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { setTimeout(send, 800); })
      .catch(function (e) { caps = 'share-' + e.name + '-' + String(e.message).slice(70, 420); });
  }

  function stationIdFor(c) {
    var list = (c.menu && c.menu.radio) || [];
    for (var i = 0; i < list.length; i++) if (list[i].url === c.url) return list[i].id;
    return null;
  }

  function render(c) {
    BHHome.setMenu(c.menu);
    // An echo of our own selection must not overwrite a newer choice; the latest state applies afterwards.
    clearTimeout(lateTimer);
    var wait = 4000 - (Date.now() - localAt);
    if (wait > 0) { lateTimer = setTimeout(function () { render(c); }, wait + 50); return; }
    if (view === 'photos') { if (c.mode !== 'share') return; BHPhotos.stop(); }
    if (c.mode === 'share' && c.offer) {
      if (c.session !== shareSession) { stopShare(); startShare(c); }
      return;
    }
    stopShare();
    if (c.mode === 'url' && c.url && c.url !== shownUrl) {
      stopAudio();
      shownUrl = c.url;
      window.location.replace(c.url);
      return;
    }
    if (c.mode === 'video' && c.video) {
      if (c.url) { playAudio(c.url, c.station, stationIdFor(c)); } else stopAudio();
      showVideo(c.video); videoVolume();
      if (c.url && c.station && c.station !== barStation) { barStation = c.station; showBar('Radio: ' + c.station); }
      if (!c.url) barStation = null;
      return;
    }
    stopVideo();
    if (c.mode === 'audio' && c.url) { playAudio(c.url, c.title, stationIdFor(c)); homeView(); return; }
    stopAudio();
    titleEl.textContent = c.title || '';
    textEl.textContent = c.text || '';
    if (c.title || c.text) setView('text'); else homeView();
  }

  // Reports once what the device can do, then the sharing state; ends up only in the server's access log.
  function probe() {
    var PC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    var chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0];
    // Test: which voice interfaces this device offers (Samsung Voice Interaction from Tizen 6.0, Tizen Voice Control from 4.0).
    var vi = 0; var vc = 0; try { vi = window.webapis && webapis.voiceinteraction ? 1 : 0; } catch (e) { vi = 9; } try { vc = window.tizen && tizen.voicecontrol ? 1 : 0; } catch (e) { vc = 9; }
    var keys = ''; try { var all = tizen.tvinputdevice.getSupportedKeys(); keys = '_keys' + all.length + '-' + all.filter(function (k) { return /voice|mic|search|bixby|assist|speech|extra|ambient|info/i.test(k.name); }).map(function (k) { return k.name + k.code; }).join('.'); } catch (e) { keys = '_keyserr-' + e.name; }
    var mic = ''; try { mic = '_mic' + (window.webapis && webapis.microphone ? (function () { try { var l = webapis.microphone.getMicrophones(); return l.length + '-' + l.map(function (m) { return String(m.name || m.id || '?').replace(/[^A-Za-z0-9]/g, ''); }).join('.'); } catch (e) { return 'err' + e.name; } })() : 0); } catch (e) { mic = '_micerr-' + e.name; }
    var gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? 1 : 0;
    var base = chrome + '_rtc' + (PC ? 1 : 0) + '_mse' + (window.MediaSource ? 1 : 0) + '_vi' + vi + '_vc' + vc + keys + mic + '_gum' + gum;
    caps = base;
    if (!PC) return;
    try {
      new PC().createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true }).then(function (d) {
        var seen = {};
        (d.sdp.match(/a=rtpmap:\d+ (H264|VP8|VP9|opus)/g) || []).forEach(function (l) { seen[l.split(' ')[1]] = 1; });
        caps = base + '_' + Object.keys(seen).join('+');
      }, function (e) { caps = base + '_offerfail-' + e.name; });
    } catch (e) { caps = base + '_ex-' + e.name; }
  }
  probe();

  // The server answers as soon as something changes; then ask again immediately.
  var version = '';
  function poll() {
    var x = new XMLHttpRequest();
    var again = function (ms) { setTimeout(poll, ms); };
    x.open('GET', window.BH_SCREEN_URL + '/content?t=' + Date.now() + '&since=' + encodeURIComponent(version) + '&caps=' + encodeURIComponent(caps + (window.BH_VOICE_STATE ? '_voice-' + window.BH_VOICE_STATE : '')));
    x.timeout = 35000;
    x.onload = function () {
      if (x.status !== 200) { again(3000); return; }
      try { var c = JSON.parse(x.responseText); version = c.v || ''; render(c); } catch (e) { /* next answer */ }
      again(30);
    };
    x.onerror = function () { again(3000); };
    x.ontimeout = function () { again(100); };
    x.send();
  }

  poll();
  sendRequest('refresh', 'x'); // Fetch a fresh timetable at startup
})();
