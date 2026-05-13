/* ── Kiwi Match – sound.js ────────────────────────────────────────
   Pure Web Audio API. No files, no CDN, zero network requests.
   All sounds are synthesised from oscillators and noise.

   Public API (all safe to call even when muted or before user gesture):
     sfx.select()          tile picked up
     sfx.swap()            valid swap initiated
     sfx.invalid()         swap rejected
     sfx.match(comboN)     tiles cleared (comboN = 1,2,3…)
     sfx.drop()            new tiles fall in
     sfx.shuffle()         board shuffle
     sfx.gameOver(isNew)   end-of-game fanfare (isNew = new best flag)
     sfx.tickUrgent()      called each second when timer ≤ 10
     sfx.stopUrgent()      cancel the urgent tick loop
     sfx.toggleMute()      toggle mute; returns new muted state
     sfx.isMuted()         current mute state
────────────────────────────────────────────────────────────────── */

const sfx = (() => {
  let ctx       = null;
  let muted     = false;
  let masterGain = null;

  /* Lazy-init AudioContext on first user gesture */
  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.7;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ── Primitive builders ─────────────────────────────────────── */

  /* Single oscillator tone */
  function tone(freq, type, startTime, duration, gainPeak, fadeOut = true) {
    const c   = getCtx();
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
    if (fadeOut) g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    return { osc, g };
  }

  /* Frequency sweep (whoosh / descend) */
  function sweep(freqStart, freqEnd, type, startTime, duration, gainPeak) {
    const c   = getCtx();
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
    g.gain.setValueAtTime(gainPeak, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  /* White noise burst */
  function noise(startTime, duration, gainPeak) {
    const c      = getCtx();
    const bufLen = Math.ceil(c.sampleRate * duration);
    const buf    = c.createBuffer(1, bufLen, c.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src    = c.createBufferSource();
    const filt   = c.createBiquadFilter();
    const g      = c.createGain();
    filt.type      = 'bandpass';
    filt.frequency.value = 800;
    filt.Q.value   = 0.5;
    src.buffer = buf;
    g.gain.setValueAtTime(gainPeak, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(masterGain);
    src.start(startTime);
    src.stop(startTime + duration + 0.05);
  }

  /* Arpeggio — play a sequence of notes */
  function arp(freqs, type, startTime, noteLen, gainPeak) {
    freqs.forEach((f, i) => tone(f, type, startTime + i * noteLen, noteLen * 2, gainPeak));
  }

  /* ── Sound events ───────────────────────────────────────────── */

  function select() {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    tone(900, 'sine', t, 0.06, 0.25);
  }

  function swap() {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    sweep(280, 520, 'sine', t, 0.12, 0.3);
  }

  function invalid() {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    sweep(260, 140, 'sawtooth', t, 0.15, 0.2);
    tone(120, 'sine', t + 0.05, 0.12, 0.15);
  }

  /* comboN: 1 = basic match, 2+ = cascade combos */
  function match(comboN = 1) {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;

    /* Base notes rise with combo level */
    const baseFreq = 440 * Math.pow(1.25, comboN - 1);   // A4, E5, B5…
    const chords   = [
      [baseFreq, baseFreq * 1.25, baseFreq * 1.5],
      [baseFreq, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 1.8],
      [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2.0],
    ];
    const notes = chords[Math.min(comboN - 1, 2)];

    /* Staggered arpeggio */
    notes.forEach((f, i) => {
      tone(f, 'triangle', t + i * 0.055, 0.22, 0.28 / notes.length);
    });

    /* Subtle noise pop */
    noise(t, 0.06, 0.08);
  }

  function drop() {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    sweep(320, 160, 'sine', t, 0.18, 0.15);
  }

  function shuffle() {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    /* Quick randomised cascade of tones */
    for (let i = 0; i < 6; i++) {
      const f = 200 + Math.random() * 400;
      tone(f, 'sine', t + i * 0.07, 0.12, 0.12);
    }
  }

  function gameOver(isNew = false) {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;

    if (isNew) {
      /* Triumphant ascending fanfare */
      arp([523, 659, 784, 1047], 'triangle', t, 0.12, 0.35);
      tone(1047, 'sine', t + 0.55, 0.5, 0.3);
    } else {
      /* Descending "wah-wah" */
      sweep(440, 220, 'sawtooth', t,       0.3, 0.25);
      sweep(350, 175, 'sawtooth', t + 0.2, 0.3, 0.2);
      sweep(280, 140, 'sawtooth', t + 0.4, 0.4, 0.15);
    }
  }

  /* ── Urgent tick (time mode ≤ 10 s) ────────────────────────── */
  let urgentHandle = null;

  function tickUrgent() {
    if (muted) return;
    const c = getCtx();
    const t = c.currentTime;
    tone(880, 'square', t, 0.04, 0.12);
  }

  function stopUrgent() {
    clearInterval(urgentHandle);
    urgentHandle = null;
  }

  /* ── Mute toggle ────────────────────────────────────────────── */
  function toggleMute() {
    muted = !muted;
    if (masterGain) {
      masterGain.gain.cancelScheduledValues(0);
      masterGain.gain.value = muted ? 0 : 0.7;
    }
    /* Persist preference */
    try { localStorage.setItem('kiwi-match-muted', muted ? '1' : '0'); } catch {}
    return muted;
  }

  function isMuted() { return muted; }

  /* Restore mute pref from last session */
  try {
    if (localStorage.getItem('kiwi-match-muted') === '1') muted = true;
  } catch {}

  return { select, swap, invalid, match, drop, shuffle, gameOver,
           tickUrgent, stopUrgent, toggleMute, isMuted };
})();