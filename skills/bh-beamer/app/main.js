// Fragt den Server, was gezeigt werden soll. Bewusst altes JavaScript: Der Beamer nutzt Tizen 5.5.
// Modi: text (Titel + Text), url (Webseite im Vollbild, verlaesst diese Seite), audio (Radio/Musik, die App spielt selbst).
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
    try { frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (e) { /* noch nicht geladen */ }
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
    if (first && playingUrl) { try { player.pause(); player.removeAttribute('src'); player.load(); } catch (e) { /* kein Player */ } startWeb(playingUrl); }
    frame.src = window.BH_SCREEN_URL + '/player?v=' + id;
  }
  function stopVideo() {
    if (!shownVideo) return;
    shownVideo = null; frame.src = 'about:blank'; barStation = null;
    stopWeb();
    if (playingUrl) { player.src = playingUrl; var p = player.play(); if (p && p.catch) p.catch(function () {}); }
  }
    function videoVolume() { ytCommand('unMute'); ytCommand('setVolume', [100]); }
  // Der Beamer laesst nur einen Medien-Player zu. Neben dem Video laeuft das Radio deshalb ueber Web Audio.
  var web = null; var CHUNK = 64000;
  var RADIO_OVER_VIDEO = 0.4; // Radio leiser, damit das Knistern des Feuers zu hoeren bleibt
  function stopWeb() {
    if (!web) return;
    web.stop = true;
    try { if (web.abort) web.abort.abort(); } catch (e) { /* schon zu */ }
    try { web.reader.cancel(); } catch (e) { /* schon zu */ }
    try { web.ctx.close(); } catch (e) { /* schon zu */ }
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
  // Schneidet an einer MP3-Rahmengrenze, damit zwischen den Stuecken nichts knackt.
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
    try { player.pause(); player.removeAttribute('src'); player.load(); } catch (e) { /* kein Player */ }
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
  // Sofort umschalten, die App erfaehrt es parallel und zeigt denselben Stand.
  BHHome.onTune = function (st) { localAt = Date.now(); playAudio(st.url, st.name, st.id); homeView(); sendRequest('radio', st.id); };
  BHHome.onMood = function (m) { localAt = Date.now(); showVideo(m.video); videoVolume(); showBar(playingUrl ? 'Radio: ' + stationEl.textContent + ' · CH wechselt' : 'CH ▲ ▼ Radio dazu · Zurück zum Start'); sendRequest('mood', m.id); };
  // Kanal-Wippe der Fernbedienung wechselt den Sender. Die Tasten muessen eigens angemeldet werden.
  try { tizen.tvinputdevice.registerKey('ChannelUp'); tizen.tvinputdevice.registerKey('ChannelDown'); } catch (e) { caps = 'ch-' + e.name; }
  // Pause heisst: Stream wirklich anhalten und den Sender merken. OK oder die Pause-Taste spielen ihn wieder ab.
  BHHome.onPause = function () {
    if (playingUrl) {
      var st = { url: playingUrl, name: stationEl.textContent, id: BHHome.currentId() };
      localAt = Date.now(); stopAudio(); paused = st;
      stationEl.textContent = st.name; stationEl.className = st.name.length > 13 ? 'long' : ''; noteEl.innerHTML = '<b>Pausiert</b> <kbd>OK</kbd> Weiter';
      BHHome.setPlaying(st.id); audioState('paused'); homeView(); sendRequest('radiooff', 'x');
    } else if (paused) { var p = paused; paused = null; BHHome.onTune(p); }
  };
  function clearPause() { paused = null; audioState('idle'); stationEl.textContent = 'Radio'; stationEl.className = ''; noteEl.innerHTML = IDLE_NOTE; BHHome.setPlaying(null); }
  try { tizen.tvinputdevice.registerKey('MediaPlayPause'); } catch (e) { /* nicht jede Fernbedienung hat sie */ }
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 10252 && view.indexOf('home') === 0) { e.preventDefault(); BHHome.onPause(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.keyCode !== 427 && e.keyCode !== 428) return;
    e.preventDefault();
    var dir = e.keyCode === 427 ? -1 : 1;
    if (view === 'video') { var st = BHHome.step(dir); if (st) { localAt = Date.now(); playAudio(st.url, st.name, st.id); videoVolume(); barStation = st.name; showBar('Radio: ' + st.name); sendRequest('radio', st.id); } }
    else if (view.indexOf('home') === 0) BHHome.channel(dir);
  });
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return; // Das Menue hat die Taste schon behandelt
    var back = e.keyCode === 10009 || e.keyCode === 8;
    if (back && view === 'video') { localAt = Date.now(); stopVideo(); homeView(); sendRequest('back', 'x'); e.preventDefault(); return; }
    if (back && view.indexOf('home') === 0 && BHHome.back()) { e.preventDefault(); return; }
    if (back && paused && view.indexOf('home') === 0) { clearPause(); e.preventDefault(); return; }
    if (back && (playingUrl || view.indexOf('home') < 0)) { stopShare(); stopAudio(); homeView(); sendRequest('stop', 'x'); e.preventDefault(); return; }
    if (view !== 'video') return;
    if (e.keyCode >= 37 && e.keyCode <= 40) { var st = BHHome.step(e.keyCode === 39 || e.keyCode === 40 ? 1 : -1); if (st) { localAt = Date.now(); playAudio(st.url, st.name, st.id); videoVolume(); barStation = st.name; showBar('Radio: ' + st.name); sendRequest('radio', st.id); } }
    else if (e.keyCode === 13 && playingUrl) { localAt = Date.now(); stopAudio(); videoVolume(); showBar('Radio aus'); sendRequest('radiooff', 'x'); }
  });

  BHHome.isRadioOn = function () { return !!playingUrl; };
  BHHome.onPreview = function (st) { stationEl.textContent = st.name; stationEl.className = st.name.length > 13 ? 'long' : ''; noteEl.textContent = 'Wechsle …'; };

  player.addEventListener('playing', function () { audioState('ok'); noteEl.innerHTML = '<kbd>▲▼</kbd> Sender <kbd>OK</kbd> Pause'; });
  player.addEventListener('waiting', function () { audioState('load'); noteEl.textContent = 'Puffert …'; });
  player.addEventListener('error', function () { if (playingUrl) { audioState('fail'); noteEl.textContent = 'Stream nicht erreichbar'; if (view === 'video') showBar('Stream nicht erreichbar'); } });

  function stopShare() {
    if (!shareSession) return;
    shareSession = null;
    try { pc.close(); } catch (e) { /* schon zu */ }
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

  // Der Browser des Beamers ist aelter als die Laptops: unbekannte Zeilen lehnt er als Ganzes ab. mDNS-Kandidaten
  // kann er nicht aufloesen; das schadet nicht, der Laptop meldet sich bei seiner echten Adresse.
  function compatibleSdp(sdp) {
    return sdp.split('\r\n').filter(function (l) { return !/^a=extmap-allow-mixed/.test(l) && !/^a=candidate:.*\.local /.test(l); }).join('\r\n');
  }

  // Ohne Trickle-ICE: Die Antwort geht erst raus, wenn alle Kandidaten drinstehen (spaetestens nach 0,8 s).
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
    // Ein Echo der eigenen Auswahl darf eine neuere Wahl nicht ueberschreiben; der neueste Stand gilt danach.
    clearTimeout(lateTimer);
    var wait = 4000 - (Date.now() - localAt);
    if (wait > 0) { lateTimer = setTimeout(function () { render(c); }, wait + 50); return; }
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

  // Meldet einmalig, was das Geraet kann, danach den Stand der Freigabe; landet nur im Zugriffsprotokoll des Servers.
  function probe() {
    var PC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    var chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0];
    var base = chrome + '_rtc' + (PC ? 1 : 0) + '_mse' + (window.MediaSource ? 1 : 0);
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

  // Der Server antwortet, sobald sich etwas aendert; danach sofort wieder fragen.
  var version = '';
  function poll() {
    var x = new XMLHttpRequest();
    var again = function (ms) { setTimeout(poll, ms); };
    x.open('GET', window.BH_SCREEN_URL + '/content?t=' + Date.now() + '&since=' + encodeURIComponent(version) + '&caps=' + encodeURIComponent(caps));
    x.timeout = 35000;
    x.onload = function () {
      if (x.status !== 200) { again(3000); return; }
      try { var c = JSON.parse(x.responseText); version = c.v || ''; render(c); } catch (e) { /* naechste Antwort */ }
      again(30);
    };
    x.onerror = function () { again(3000); };
    x.ontimeout = function () { again(100); };
    x.send();
  }

  poll();
  sendRequest('refresh', 'x'); // Beim Start den Stundenplan frisch holen
})();
