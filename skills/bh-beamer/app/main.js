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
  var shownVideo = null; var vbarTimer = null; var localAt = 0; var failed = false;
  var playingEl = document.getElementById('playing');
  function audioState(state) { failed = state === 'fail'; playingEl.setAttribute('data-s', state); }

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
    shownVideo = id;
    frame.src = window.BH_SCREEN_URL + '/player?v=' + id;
  }
  function stopVideo() {
    if (!shownVideo) return;
    shownVideo = null; frame.src = 'about:blank';
  }
  // Mit Radio laeuft das Video leise weiter, das Knistern bleibt zu hoeren.
  function videoVolume() { ytCommand('setVolume', [playingUrl ? 25 : 100]); }
  window.addEventListener('message', function (e) {
    var d; try { d = JSON.parse(e.data); } catch (x) { return; }
    if (d.event === 'onError') caps = 'yt-error-' + d.info;
    if (d.event === 'onReady' || d.event === 'initialDelivery') videoVolume();
    if (d.event === 'infoDelivery' && d.info && d.info.playerState !== undefined) { caps = 'yt-state-' + d.info.playerState; videoVolume(); }
  });
  var view = 'home';
  function setView(name) { view = name; document.body.className = name; }
  function homeView() { setView(playingUrl ? 'home audio' : 'home'); }

  function stopAudio() {
    if (!playingUrl) return;
    playingUrl = null;
    try { player.pause(); player.removeAttribute('src'); player.load(); } catch (e) { /* kein Player */ }
    BHHome.setPlaying(null);
  }

  function playAudio(url, title, id) {
    stationEl.textContent = title || '';
    BHHome.setPlaying(id || null);
    if (url === playingUrl && !failed) return;
    playingUrl = url;
    audioState('load');
    noteEl.textContent = 'Verbinde …';
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
  BHHome.onMood = function (m) { localAt = Date.now(); showVideo(m.video); videoVolume(); sendRequest('mood', m.id); };
  document.addEventListener('keydown', function (e) {
    var back = e.keyCode === 10009 || e.keyCode === 8;
    if (back && view === 'video') { localAt = Date.now(); stopVideo(); homeView(); sendRequest('back', 'x'); e.preventDefault(); return; }
    if (back && (playingUrl || view.indexOf('home') < 0)) { stopShare(); stopAudio(); homeView(); sendRequest('stop', 'x'); e.preventDefault(); return; }
    if (view !== 'video') return;
    if (e.keyCode === 37 || e.keyCode === 39) { var st = BHHome.step(e.keyCode === 39 ? 1 : -1); if (st) { localAt = Date.now(); playAudio(st.url, st.name, st.id); videoVolume(); showBar(st.name); sendRequest('radio', st.id); } }
    else if (e.keyCode === 13 && playingUrl) { localAt = Date.now(); stopAudio(); videoVolume(); showBar('Radio aus'); sendRequest('radiooff', 'x'); }
  });

  player.addEventListener('playing', function () { audioState('ok'); noteEl.textContent = '◀ ▶ Sender wechseln · Zurück beendet'; });
  player.addEventListener('waiting', function () { audioState('load'); noteEl.textContent = 'Puffert …'; });
  player.addEventListener('error', function () { if (playingUrl) { audioState('fail'); noteEl.textContent = 'Stream nicht erreichbar'; } });

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
    // Ein Echo der eigenen Auswahl darf eine neuere Wahl nicht ueberschreiben.
    if (Date.now() - localAt < 4000) return;
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
})();
