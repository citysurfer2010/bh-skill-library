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

  function stopAudio() {
    if (!playingUrl) return;
    playingUrl = null;
    try { player.pause(); player.removeAttribute('src'); player.load(); } catch (e) { /* kein Player */ }
    document.body.className = '';
  }

  function playAudio(url) {
    if (url === playingUrl) return;
    playingUrl = url;
    document.body.className = 'audio';
    noteEl.textContent = 'Verbinde …';
    player.src = url;
    var p = player.play();
    if (p && p.catch) p.catch(function () { noteEl.textContent = 'Wiedergabe nicht möglich'; });
  }

  player.addEventListener('playing', function () { noteEl.textContent = 'Läuft'; });
  player.addEventListener('waiting', function () { noteEl.textContent = 'Puffert …'; });
  player.addEventListener('error', function () { noteEl.textContent = 'Stream nicht erreichbar'; });

  function stopShare() {
    if (!shareSession) return;
    shareSession = null;
    try { pc.close(); } catch (e) { /* schon zu */ }
    pc = null;
    shareEl.srcObject = null;
    document.body.className = '';
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
    return sdp.split('\r\n').filter(function (l) { return !/^a=extmap-allow-mixed/.test(l) && !/^a=ssrc:\d+ msid:/.test(l) && !/^a=candidate:.*\.local /.test(l); }).join('\r\n');
  }

  // Ohne Trickle-ICE: Die Antwort geht erst raus, wenn alle Kandidaten drinstehen (spaetestens nach 2,5 s).
  function startShare(c) {
    stopAudio();
    shareSession = c.session;
    document.body.className = 'share';
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
      .then(function () { setTimeout(send, 2500); })
      .catch(function (e) { caps = 'share-' + e.name + '-' + String(e.message).slice(70, 420); });
  }

  function render(c) {
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
    if (c.mode === 'audio' && c.url) playAudio(c.url); else stopAudio();
    titleEl.textContent = c.title || '';
    textEl.textContent = c.text || '';
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

  function poll() {
    var x = new XMLHttpRequest();
    x.open('GET', window.BH_SCREEN_URL + '/content?t=' + Date.now() + '&caps=' + encodeURIComponent(caps));
    x.onload = function () {
      if (x.status !== 200) { textEl.textContent = 'Server antwortet nicht (' + x.status + ')'; return; }
      try { render(JSON.parse(x.responseText)); } catch (e) { textEl.textContent = 'Antwort unlesbar'; }
    };
    x.onerror = function () { textEl.textContent = 'Keine Verbindung zum Server'; };
    x.send();
  }

  poll();
  setInterval(poll, 3000);
})();
