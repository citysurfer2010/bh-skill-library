'use strict';
/**
 * Bildschirm oder Kamera des Laptops auf den Beamer (WebRTC ohne Trickle-ICE). Der Server vermittelt nur Angebot
 * und Antwort, das Bild läuft direkt. Bewusst ohne STUN/TURN: Es funktioniert nur im selben Heimnetz.
 */
window.BeamerShare = (() => {
  const ANSWER_TRIES = 40; const ANSWER_MS = 1000;
  let pc = null; let stream = null; let run = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const canScreen = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  function gathered(conn) {
    if (conn.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { if (conn.iceGatheringState === 'complete') resolve(); };
      conn.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, 3000);
    });
  }

  // Der Beamer dekodiert H264 in Hardware, VP9 eher nicht.
  function preferH264(conn) {
    if (!window.RTCRtpSender || !RTCRtpSender.getCapabilities) return;
    const codecs = RTCRtpSender.getCapabilities('video').codecs;
    const sorted = [...codecs.filter((c) => /h264/i.test(c.mimeType)), ...codecs.filter((c) => !/h264/i.test(c.mimeType))];
    conn.getTransceivers().forEach((t) => { if (t.sender.track?.kind === 'video' && t.setCodecPreferences) t.setCodecPreferences(sorted); });
  }

  function release() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (pc) pc.close();
    stream = null; pc = null;
  }

  async function capture(kind) {
    if (kind === 'camera') return navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true });
  }

  async function stop() {
    run++; const active = !!pc;
    release();
    if (active) await BeamerApi.send('/share/stop');
  }

  /** onState: 'connecting' | 'live' | 'ended' | 'failed'. Wirft, wenn die Freigabe gar nicht erst zustande kommt. */
  async function start(kind, onState) {
    await stop().catch(() => {});
    const mine = ++run;
    stream = await capture(kind);
    const conn = new RTCPeerConnection({ iceServers: [] }); pc = conn;
    stream.getTracks().forEach((t) => conn.addTrack(t, stream));
    preferH264(conn);
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (mine === run) stop().finally(() => onState('ended')); });
    conn.addEventListener('connectionstatechange', () => {
      if (mine !== run) return;
      if (conn.connectionState === 'connected') onState('live');
      if (conn.connectionState === 'failed') { onState('failed'); stop().catch(() => {}); }
    });
    onState('connecting');
    await conn.setLocalDescription(await conn.createOffer());
    await gathered(conn);
    const { session } = await BeamerApi.send('/share/start', { offer: conn.localDescription.sdp, kind });
    for (let i = 0; i < ANSWER_TRIES && mine === run; i++) {
      await sleep(ANSWER_MS);
      const { answer } = await BeamerApi.send('/share/answer', { session });
      if (answer && mine === run) { await conn.setRemoteDescription({ type: 'answer', sdp: answer }); return; }
    }
    if (mine === run) { await stop().catch(() => {}); throw new Error('Der Beamer hat nicht geantwortet'); }
  }

  return { start, stop, canScreen };
})();
