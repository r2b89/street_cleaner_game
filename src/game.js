'use strict';
/*
 * STREET SWEEPER vs. THE SCOOTER FREELOADERS — proof of concept
 *
 * Rule of the street: ONE person per scooter.
 * Splash the extra passengers with a wet sponge. Never hit the driver.
 * Let an overloaded scooter escape, or splash a driver, and you lose reputation.
 */
(() => {
  // ---------------------------------------------------------------- setup
  const W = 960, H = 540;
  const FONT = '"Chalkboard SE", "Comic Sans MS", "Marker Felt", sans-serif';
  const INK = '#1e1e24';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
    canvas.width = Math.floor(W * s * dpr);
    canvas.height = Math.floor(H * s * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- helpers
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // outlined limb: thick dark stroke, then colored stroke on top
  function limb(x1, y1, x2, y2, color, width) {
    line(x1, y1, x2, y2, INK, width + 3);
    line(x1, y1, x2, y2, color, width);
  }

  function circle(x, y, r, fill, stroke = INK, lw = 2) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  function text(t, x, y, size, color = '#fff', align = 'left', base = 'alphabetic') {
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 5);
    ctx.strokeStyle = INK;
    ctx.strokeText(t, x, y);
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  }

  // ---------------------------------------------------------------- 8-bit audio (NES-style: square, triangle, noise)
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const Sfx = {
    ac: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    noiseBuf: null,
    muted: false,
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        this.ac = ac;
        this.master = ac.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(ac.destination);
        this.sfxBus = ac.createGain();
        this.sfxBus.gain.value = 0.9;
        this.sfxBus.connect(this.master);
        this.musicBus = ac.createGain();
        this.musicBus.gain.value = 0.5;
        this.musicBus.connect(this.master);
        // one shared second of white noise for drums and splats
        this.noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ac = null; }
    },
    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    },
    // a single chiptune note; hard-ish envelope so it sounds "8-bit"
    note(freq, t, dur, type = 'square', vol = 0.1, bus = this.sfxBus) {
      if (!this.ac) return;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.setValueAtTime(vol, t + dur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + dur + 0.01);
    },
    // a run of notes played back to back (classic 8-bit arpeggio jingles)
    arp(notes, stepDur, type = 'square', vol = 0.08) {
      if (!this.ac) return;
      const t0 = this.ac.currentTime;
      notes.forEach((n, i) => { if (n) this.note(midi(n), t0 + i * stepDur, stepDur * 0.95, type, vol); });
    },
    noise(t, dur, vol = 0.2, filter = 'lowpass', freq = 3000, bus = this.sfxBus) {
      if (!this.ac) return;
      const src = this.ac.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ac.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      const g = this.ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(bus);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.01);
    },
    now() { return this.ac ? this.ac.currentTime : 0; },

    throw() { this.arp([84, 79, 74], 0.025, 'square', 0.05); },
    splat() {
      this.noise(this.now(), 0.14, 0.35, 'lowpass', 1800);
      this.note(110, this.now(), 0.06, 'square', 0.06);
    },
    hit(combo) { // rising pitch with the combo
      const b = 72 + Math.min(combo, 8) * 2;
      this.arp([b, b + 4, b + 7, b + 12], 0.04, 'square', 0.07);
    },
    legal() { this.arp([0, 0, 0, 79, 84, 88, 91], 0.06, 'triangle', 0.18); },
    bad() { this.arp([64, 63, 62, 0, 55], 0.11, 'square', 0.09); },
    coin() { this.arp([83, 88, 88, 88], 0.05, 'square', 0.06); },
    trashLand() {
      this.noise(this.now(), 0.05, 0.12, 'bandpass', 900);
      this.note(165, this.now(), 0.04, 'square', 0.03);
    },
    start() { this.arp([60, 64, 67, 72, 0, 67, 72], 0.07, 'square', 0.07); },
    gameOver() { this.arp([67, 0, 66, 0, 65, 0, 64, 64, 64, 64], 0.13, 'square', 0.08); },
  };

  // looping chiptune: lead (square), bass (triangle), drums (noise). 4 bars of 16 steps.
  const _ = 0;
  const TUNE = {
    bpm: 150,
    lead: [
      72, _, 76, _, 79, _, 76, _, 72, _, 74, 76, 77, _, 76, _,
      69, _, 72, _, 76, _, 72, _, 69, _, 71, 72, 74, _, 72, _,
      65, _, 69, _, 72, _, 77, _, 76, _, 74, _, 72, _, 69, _,
      67, _, 71, _, 74, _, 79, _, 77, _, 74, _, 71, _, 74, 76,
    ],
    roots: [48, 45, 41, 43],
  };
  const Music = {
    playing: false,
    step: 0,
    nextT: 0,
    timer: null,
    start() {
      if (!Sfx.ac || this.playing) return;
      this.playing = true;
      this.nextT = Sfx.ac.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
    },
    stop() {
      this.playing = false;
      clearInterval(this.timer);
    },
    tick() {
      const ac = Sfx.ac;
      const stepDur = 60 / TUNE.bpm / 4;
      while (this.nextT < ac.currentTime + 0.12) {
        this.play(this.step, this.nextT, stepDur);
        this.nextT += stepDur;
        this.step = (this.step + 1) % 64;
      }
    },
    play(i, t, d) {
      const bus = Sfx.musicBus;
      const s = i % 16;
      const lead = TUNE.lead[i];
      if (lead) Sfx.note(midi(lead), t, d * 1.6, 'square', 0.045, bus);
      if (s % 2 === 0) { // bouncing octave bass on eighths
        const root = TUNE.roots[Math.floor(i / 16)];
        Sfx.note(midi(s % 4 === 0 ? root : root + 12), t, d * 1.8, 'triangle', 0.16, bus);
      }
      if (s === 0 || s === 8 || s === 10) Sfx.note(90, t, 0.06, 'triangle', 0.25, bus); // kick
      if (s === 4 || s === 12) Sfx.noise(t, 0.09, 0.14, 'highpass', 1500, bus); // snare
      if (s % 2 === 1) Sfx.noise(t, 0.025, 0.05, 'highpass', 7000, bus); // hat
    },
  };

  // ---------------------------------------------------------------- content
  const SKINS = ['#f5d0a9', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a5694f'];
  const SHIRTS = ['#e74c3c', '#3498db', '#9b59b6', '#1abc9c', '#f1c40f', '#e67e22', '#ff6fb5', '#2ecc71', '#34495e', '#ffffff'];
  const PANTS = ['#2c3e50', '#34495e', '#5d4037', '#1b2631', '#7f8c8d', '#283593'];
  const HAIRS = ['#2b1b0e', '#6d4c41', '#f4d03f', '#c0392b', '#111111', '#ecf0f1', '#8e44ad', '#00bcd4'];
  // overloaded-scooter crews: grubby, faded, stained
  const DIRTY_SHIRTS = ['#7a6a4f', '#5b5b3a', '#6b4f3a', '#4f5b4a', '#8a7d6b', '#5a4a5a', '#7d6f5c'];
  const DIRTY_PANTS = ['#4a4236', '#3b3a30', '#55493a', '#40403a'];
  const SCOOTER_COLORS = ['#27ae60', '#2c3e50', '#e84393', '#00a8ff', '#fbc531', '#ff793f'];

  const PASSENGER_YELLS = [
    'MY LATTE!', 'I was just vibing!', "It's a two-seater, bro!", 'Worth it!', 'Not the hair!!',
    "I'll leave a bad review!", 'WHEEEEE—', 'My podcast will hear about this!', "I'm an influencer!",
    'Tell my mom...', 'Totally legal in Narnia!', 'AAAAAAA', 'Do it again!', 'Rude!!',
    'I only weigh 40 kilos!', 'I was paying half!', 'Not again, Boris!',
  ];
  const LEGAL_LINES = ['...thanks?', 'Finally, legroom.', 'Bye Kevin!', 'Much faster now.', "Wait, where's Dave?", 'Did we lose someone?'];
  // solo riders are hard-working couriers (fictional delivery companies)
  const COURIERS = [
    { name: 'NOM', color: '#ff7a00' },
    { name: 'GRUB', color: '#27ae60' },
    { name: 'YUM!', color: '#e84393' },
    { name: 'ZOOM', color: '#00a8e8' },
    { name: 'BURP', color: '#f1c40f' },
  ];
  const COURIER_ANGRY = [
    'MY TIPS!!', "That was someone's sushi!", 'The soup is now street soup!', "I'm rating YOU one star!",
    'Order #4471 is RUINED!', 'Customer is gonna cry!', 'I had 2 minutes left!', 'Was that... a sponge?!',
  ];
  const FOOD_COLORS = ['#ffcc33', '#e74c3c', '#f5deb3', '#8b5a2b', '#2ecc71', '#fff'];
  const RIDER_ANGRY = ["I'M LEGAL!!", 'What did I do?!', 'Calling my lawyer!', 'I paid for this ride!', 'HEY! Wrong guy!', 'Ow! My dignity!'];
  const CLEANER_QUIPS = [
    'One scooter. One butt.', 'Rules are rules.', 'Sweep-sweep!', 'Clean streets, clean souls.',
    'Not on my sidewalk.', 'Splish. Splash. Justice.', "Two's a crowd.", 'I mop, therefore I am.',
  ];
  const CLEANER_OOPS = ['Oh no.', 'My pension!', 'Not again...', 'Boss is gonna kill me.', 'That was the sponge’s fault.'];
  const THROW_LINES = ['Yeet!', 'Bin? Never heard of it.', 'Catch, Boris!', 'Oops.', 'Nature will handle it.'];
  const SIGNS = ['KEBAB', 'LAUNDRY', 'VAPES', 'PAWN', 'PHO', 'COFFEE?', 'SCOOTER REPAIR', 'NAILS', '24/7', 'SHAWARMA', 'BROOMS R US'];

  // street layout: three lanes with fake depth (further lane = smaller)
  const LANES = [
    { y: 215, dir: 1, s: 0.8 },
    { y: 300, dir: -1, s: 0.9 },
    { y: 385, dir: 1, s: 1.0 },
  ];
  const SIDEWALK_TOP = 455, SIDEWALK_BOTTOM = 525;
  const LITTER_MAX = 8;
  const SWEEP_RX = 36, SWEEP_RY = 26; // broom reach around Boris's feet
  const CART = { x: 43, y: 462 };
  const MAX_HEARTS = 5;

  const BUILDINGS = [];
  (function genBuildings() {
    const cols = ['#c97b63', '#8e9aaf', '#b5838d', '#6d6875', '#e5989b', '#a3b18a', '#588157', '#d4a373', '#7d8597'];
    let x = -20;
    while (x < W + 20) {
      const w = randi(90, 150), h = randi(75, 125);
      const win = [];
      const rows = Math.floor((h - 38) / 22), cols2 = Math.floor((w - 16) / 22);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols2; c++) win.push({ c, r, lit: Math.random() < 0.4 });
      BUILDINGS.push({
        x, w, h, c: pick(cols), win,
        sign: Math.random() < 0.65 ? pick(SIGNS) : null,
        signC: pick(['#ffd166', '#ef476f', '#06d6a0', '#8ecae6', '#ffffff']),
      });
      x += w + randi(0, 8);
    }
  })();
  const CLOUDS = Array.from({ length: 5 }, () => ({ x: rand(0, W), y: rand(20, 90), v: rand(6, 16), s: rand(0.7, 1.3) }));

  // ---------------------------------------------------------------- input
  const keys = {};
  const mouse = { x: W / 2, y: 250, down: false };
  let best = 0;
  try { best = +localStorage.getItem('streetSweeperBest') || 0; } catch (e) { /* storage blocked */ }

  function setMouse(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    mouse.x = (clientX - r.left) / r.width * W;
    mouse.y = (clientY - r.top) / r.height * H;
  }
  canvas.addEventListener('mousemove', (e) => setMouse(e.clientX, e.clientY));
  canvas.addEventListener('mousedown', (e) => { setMouse(e.clientX, e.clientY); mouse.down = true; onClick(); });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    setMouse(t.clientX, t.clientY);
    mouse.down = true;
    onClick();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    setMouse(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchend', () => { mouse.down = false; Tilt.enable(); });

  // Tilt steering for phones: lean the phone to walk Boris around.
  // Uses deviceorientation (beta/gamma are consistent across iOS and Android,
  // unlike the raw accelerometer signs), converted into a gravity direction
  // in screen space so it works in portrait and both landscape orientations.
  // The pose the player holds when a round starts is "neutral".
  const Tilt = (() => {
    const T = {
      supported: typeof DeviceOrientationEvent !== 'undefined',
      touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      active: false, asked: false,
      x: 0, y: 0,          // filtered gravity in screen space
      x0: 0, y0: 0,        // neutral pose
      needCal: true,
      mx: 0, my: 0,        // movement output, -1..1
    };
    const DEAD = 0.04;     // ~2.5° of slack so a steady hand doesn't drift
    const FULL = 0.26;     // ~15° of lean for full speed
    function screenAngle() {
      if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
      return typeof window.orientation === 'number' ? window.orientation : 0;
    }
    function onOrient(e) {
      if (e.beta == null || e.gamma == null) return;
      T.active = true;
      const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
      // direction a marble would roll, in device coords (x right, y down the screen)
      const dx = Math.sin(g) * Math.cos(b), dy = Math.sin(b);
      const a = screenAngle() * Math.PI / 180;
      const sx = dx * Math.cos(a) + dy * Math.sin(a);
      const sy = -dx * Math.sin(a) + dy * Math.cos(a);
      if (T.needCal) { T.x = T.x0 = sx; T.y = T.y0 = sy; T.needCal = false; }
      T.x += (sx - T.x) * 0.35;
      T.y += (sy - T.y) * 0.35;
    }
    function axis(v) {
      const m = Math.abs(v);
      return m < DEAD ? 0 : Math.sign(v) * Math.min(1, (m - DEAD) / (FULL - DEAD));
    }
    T.enable = () => {
      if (!T.supported || T.asked) return;
      T.asked = true;
      const listen = () => window.addEventListener('deviceorientation', onOrient);
      // iOS 13+ needs explicit permission, granted from a user gesture
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then((r) => { if (r === 'granted') listen(); })
          .catch(() => { T.asked = false; });
      } else listen();
    };
    T.calibrate = () => { T.needCal = true; T.mx = T.my = 0; };
    T.update = () => {
      if (!T.active) { T.mx = T.my = 0; return; }
      T.mx = axis(T.x - T.x0);
      T.my = axis(T.y - T.y0);
    };
    window.addEventListener('orientationchange', () => T.calibrate());
    return T;
  })();
  canvas.addEventListener('click', () => Tilt.enable());

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    keys[k] = true;
    Sfx.init();
    if (k === 'm') Sfx.toggleMute();
    if (k === 'p' || k === 'escape') {
      if (state === 'play') state = 'paused';
      else if (state === 'paused') state = 'play';
    }
    if (k === 'enter') onClick();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    if (state === 'play') state = 'paused';
  });

  // ---------------------------------------------------------------- game state
  let state = 'title'; // title | play | paused | over
  let G = null;
  let overClickT = 0;

  function newGame(demo) {
    G = {
      demo, t: 0, score: 0, hearts: MAX_HEARTS, combo: 0, bestCombo: 0, splashed: 0, swept: 0,
      cleaner: { x: W / 2, y: 490, face: 1, throwT: 0, sweepT: 0, walk: 0, cool: 0.4, quip: null, quipT: 0 },
      scooters: [], flyers: [], sponges: [], parts: [], pops: [], trash: [], binned: [],
      cartBump: 0, litterHint: false,
      spawnT: demo ? 0.1 : 1.2, shake: 0, overT: -1, bannerT: demo ? 0 : 4.5, nextQuipT: rand(8, 14),
    };
  }

  function start() {
    Sfx.init();
    newGame(false);
    state = 'play';
    Tilt.calibrate();
    Sfx.start();
    cleanerSay('Another day, another freeloader.');
  }

  function onClick() {
    Sfx.init();
    if (state === 'title') start();
    else if (state === 'over' && overClickT <= 0) start();
    else if (state === 'paused') { state = 'play'; Tilt.calibrate(); }
  }

  function gameOver() {
    state = 'over';
    G.demo = true;
    overClickT = 1.0;
    Sfx.gameOver();
    if (G.score > best) {
      best = G.score;
      try { localStorage.setItem('streetSweeperBest', String(best)); } catch (e) { /* storage blocked */ }
    }
  }

  // ---------------------------------------------------------------- entities
  function makePerson(isRider, scruffy, courier = null) {
    let hat = null;
    if (courier) hat = 'helmet';
    else if (scruffy) hat = Math.random() < 0.45 ? 'beanie' : (Math.random() < 0.3 ? 'cap' : null);
    else if (isRider) hat = Math.random() < 0.35 ? 'helmet' : (Math.random() < 0.3 ? 'cap' : null);
    else if (Math.random() < 0.25) hat = 'cap';
    let item = null;
    if (!isRider && Math.random() < (scruffy ? 0.65 : 0.4)) {
      item = scruffy ? pick(['bottle', 'bottle', 'chicken', 'phone']) : pick(['coffee', 'phone', 'balloon']);
    }
    return {
      isRider, hat, scruffy, item, courier,
      skin: pick(SKINS),
      shirt: courier ? courier.color : scruffy ? pick(DIRTY_SHIRTS) : pick(SHIRTS),
      pants: scruffy ? pick(DIRTY_PANTS) : pick(PANTS),
      hair: pick(HAIRS),
      style: scruffy ? pick([1, 2, 3, 4, 5, 5]) : randi(0, 4),
      // stain spots on the shirt, a patch on the pants
      stains: scruffy ? Array.from({ length: randi(2, 3) }, () => ({ x: rand(-6, 6), y: rand(-43, -26), r: rand(1.8, 3.2) })) : null,
      off: 0, target: 0, bubble: null, bubbleT: 0, phase: rand(0, 6.28),
    };
  }

  function say(p, msg, dur = 1.9) { p.bubble = msg; p.bubbleT = dur; }
  function cleanerSay(msg) { G.cleaner.quip = msg; G.cleaner.quipT = 2.2; }

  function layoutScooter(sc, instant) {
    const n = sc.people.length;
    const gap = n > 3 ? 22 : 26;
    sc.people.forEach((p, i) => {
      p.target = 22 - i * gap; // driver at the front, freeloaders stacked behind
      if (instant) p.off = p.target;
    });
  }

  function spawnScooter() {
    const li = randi(0, 2);
    const lane = LANES[li];
    const dir = lane.dir;
    const startX = dir > 0 ? -130 : W + 130;
    for (const sc of G.scooters) if (sc.lane === li && Math.abs(sc.x - startX) < 210) return false;

    const pOver = G.demo ? 0.6 : clamp(0.45 + G.t / 300, 0.45, 0.75);
    let n = 1;
    if (Math.random() < pOver) {
      const r = Math.random();
      n = r < 0.6 ? 2 : r < 0.9 ? 3 : 4;
    }
    const people = [];
    for (let i = 0; i < n; i++) people.push(makePerson(i === 0, n > 1, n === 1 ? pick(COURIERS) : null));
    const speed = rand(70, 120) * Math.min(1.8, 1 + G.t / 150) * (1 - 0.07 * (n - 1)) * (0.8 + lane.s * 0.2);
    const sc = {
      lane: li, dir, x: startX, speed, people,
      color: pick(SCOOTER_COLORS), phase: rand(0, 6.28),
      crashed: false, crashT: 0, rot: 0, vr: 0, trashT: rand(1.5, 5),
    };
    layoutScooter(sc, true);
    sc.deckBack = Math.min(-34, people[n - 1].target - 12);
    G.scooters.push(sc);
    return true;
  }

  function personPos(sc, i) {
    const lane = LANES[sc.lane];
    const s = lane.s;
    const p = sc.people[i];
    const wobble = Math.sin(G.t * 9 + sc.phase + i * 1.3) * 1.6 * s * (sc.people.length - 1);
    return { x: sc.x + p.off * sc.dir * s, y: lane.y - 14 * s + wobble, s };
  }

  function launch(p, q, sc, sp) {
    G.flyers.push({
      p, x: q.x, y: q.y, s: q.s, dir: sc.dir,
      vx: (sp ? sp.vx * 0.2 : 0) + sc.dir * sc.speed * 0.6 + rand(-60, 60),
      vy: -rand(780, 940),
      rot: 0, vr: rand(-12, 12),
    });
  }

  function splash(x, y, n, colors = ['#7fd3ff', '#ffffff', '#b8f0ff', '#ffe066']) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(60, 260);
      G.parts.push({ type: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: 700, life: rand(0.4, 0.8), max: 0.8, r: rand(2, 4.5), color: pick(colors) });
    }
  }

  function dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      G.parts.push({ type: 'dust', x: x + rand(-10, 10), y: y + rand(-4, 4), vx: rand(-60, 60), vy: rand(-50, -10), g: 0, life: rand(0.3, 0.6), max: 0.6, r: rand(4, 8), color: '#b9b1a3' });
    }
  }

  function popup(msg, x, y, color = '#fff', size = 20, life = 1.1) {
    G.pops.push({ msg, x, y, color, size, life, max: life });
  }

  function penalty(msg, x, y) {
    if (G.demo) return;
    G.hearts--;
    G.combo = 0;
    G.shake = 14;
    Sfx.bad();
    popup(msg + ' -1♥', clamp(x, 150, W - 150), clamp(y, 70, H - 70), '#ff5c5c', 24, 1.7);
    cleanerSay(pick(CLEANER_OOPS));
    if (G.hearts <= 0 && G.overT < 0) G.overT = 1.4;
  }

  function fire() {
    const c = G.cleaner;
    const hx = c.x + 12 * c.face, hy = c.y - 72;
    const dx = mouse.x - hx, dy = mouse.y - hy;
    const d = Math.hypot(dx, dy) || 1;
    const speed = 1050;
    G.sponges.push({ x: hx, y: hy, vx: dx / d * speed, vy: dy / d * speed, rot: 0, life: 2 });
    c.cool = 0.3;
    c.throwT = 0.18;
    Sfx.throw();
  }

  function crashScooter(sc, sp) {
    sc.crashed = true;
    sc.vr = rand(5, 9) * (sp.vx >= 0 ? 1 : -1);
    sc.people.forEach((p, i) => {
      const q = personPos(sc, i);
      if (i > 0) say(p, pick(PASSENGER_YELLS), 2);
      launch(p, q, sc, sp);
    });
    sc.people = [];
  }

  function onHit(sc, i, q, sp) {
    splash(sp.x, sp.y, 16);
    Sfx.splat();
    if (i === 0 && sc.people[0].courier) {
      // a delivery guy just doing his job — dinner goes everywhere
      say(sc.people[0], pick(COURIER_ANGRY), 2.4);
      splash(q.x - 16 * sc.dir * q.s, q.y - 50 * q.s, 22, FOOD_COLORS);
      crashScooter(sc, sp);
      penalty('ORDER RUINED! 1★ REVIEW', q.x, q.y - 90);
      return;
    }
    if (i === 0) {
      // the driver is legal — splashing them is a scandal
      say(sc.people[0], pick(RIDER_ANGRY), 2.2);
      crashScooter(sc, sp);
      penalty('COMPLAINT FILED!', q.x, q.y - 90);
      return;
    }
    const p = sc.people.splice(i, 1)[0];
    say(p, pick(PASSENGER_YELLS), 2.2);
    launch(p, q, sc, sp);
    G.combo++;
    G.bestCombo = Math.max(G.bestCombo, G.combo);
    G.splashed++;
    const mult = Math.min(5, 1 + Math.floor((G.combo - 1) / 2));
    const pts = 100 * mult;
    G.score += pts;
    popup(`+${pts}` + (mult > 1 ? `  x${mult}` : ''), q.x, q.y - 70, '#ffffff', 22);
    Sfx.hit(G.combo);
    if (sc.people.length === 1) {
      G.score += 50;
      const r = personPos(sc, 0);
      popup('LEGAL ✓ +50', r.x, r.y - 100, '#9dff6b', 18, 1.3);
      say(sc.people[0], pick(LEGAL_LINES), 2);
      setTimeout(() => Sfx.legal(), 120);
    }
    layoutScooter(sc, false);
    if (Math.random() < 0.25) cleanerSay(pick(CLEANER_QUIPS));
  }

  function checkSpongeHit(sp) {
    let best = null, bestD = 1e9;
    const r = 6;
    for (const sc of G.scooters) {
      if (sc.crashed) continue;
      for (let i = 0; i < sc.people.length; i++) {
        const q = personPos(sc, i);
        if (sp.x > q.x - 11 * q.s - r && sp.x < q.x + 11 * q.s + r && sp.y > q.y - 66 * q.s - r && sp.y < q.y + r) {
          // overlapping bodies: the one whose center is closest gets it (fair to the driver)
          const d = Math.abs(sp.x - q.x);
          if (d < bestD) { bestD = d; best = { sc, i, q }; }
        }
      }
    }
    if (!best) return false;
    onHit(best.sc, best.i, best.q, sp);
    return true;
  }

  function throwTrash(x0, y0) {
    const tx = clamp(x0 + rand(-130, 130), 30, W - 30), ty = rand(SIDEWALK_TOP, SIDEWALK_BOTTOM);
    const T = rand(0.8, 1.1), g = 900;
    G.trash.push({
      x: x0, y: y0, tx, ty, g, t: 0, T, landed: false,
      vx: (tx - x0) / T, vy: (ty - y0 - 0.5 * g * T * T) / T,
      type: randi(0, 3), rot: 0, vr: rand(-8, 8),
    });
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    G.t += dt;
    const c = G.cleaner;

    // cleaner
    if (!G.demo) {
      let mx = 0, my = 0;
      if (keys.a || keys.arrowleft) mx -= 1;
      if (keys.d || keys.arrowright) mx += 1;
      if (keys.w || keys.arrowup) my -= 1;
      if (keys.s || keys.arrowdown) my += 1;
      Tilt.update();
      if (!mx && !my) { mx = Tilt.mx; my = Tilt.my; }
      c.x = clamp(c.x + mx * 270 * dt, 30, W - 30);
      c.y = clamp(c.y + my * 160 * dt, SIDEWALK_TOP + 5, SIDEWALK_BOTTOM);
      if (mx || my) c.walk += dt * 12;
      c.cool -= dt;
      if ((mouse.down || keys[' ']) && c.cool <= 0) fire();
    }
    c.face = mouse.x >= c.x ? 1 : -1;
    c.throwT -= dt;
    c.sweepT -= dt;
    c.quipT -= dt;
    G.nextQuipT -= dt;
    if (!G.demo && G.nextQuipT <= 0) {
      cleanerSay(pick(CLEANER_QUIPS));
      G.nextQuipT = rand(10, 16);
    }

    // spawning (gets faster over time)
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      if (spawnScooter()) G.spawnT = G.demo ? rand(0.9, 1.8) : Math.max(0.6, 2.1 - G.t / 70) * rand(0.7, 1.3);
      else G.spawnT = 0.2;
    }

    // scooters
    for (const sc of G.scooters) {
      if (sc.crashed) {
        sc.crashT += dt;
        sc.x += sc.dir * sc.speed * dt;
        sc.speed = Math.max(0, sc.speed - 220 * dt);
        sc.rot += sc.vr * dt;
        sc.vr *= 0.97;
        if (sc.crashT > 2) sc.dead = true;
        continue;
      }
      // don't drive through the scooter in front
      let v = sc.speed;
      for (const o of G.scooters) {
        if (o === sc || o.crashed || o.lane !== sc.lane) continue;
        const ahead = (o.x - sc.x) * sc.dir;
        if (ahead > 0 && ahead < 140) v = Math.min(v, o.speed * 0.95);
      }
      sc.x += sc.dir * v * dt;
      const k = 1 - Math.exp(-dt * 8);
      for (const p of sc.people) p.off += (p.target - p.off) * k;

      // littering
      if (!G.demo && !sc.people.every((p) => p.courier) && sc.x > 40 && sc.x < W - 40) { // couriers are too busy to litter
        sc.trashT -= dt;
        if (sc.trashT <= 0) {
          sc.trashT = rand(3, 7) * Math.max(0.5, 1 - G.t / 240);
          const i = randi(0, sc.people.length - 1);
          const q = personPos(sc, i);
          throwTrash(q.x, q.y - 50 * q.s);
          if (Math.random() < 0.4) say(sc.people[i], pick(THROW_LINES), 1.4);
        }
      }

      // escaped?
      const off = sc.dir > 0 ? sc.x > W + 140 : sc.x < -140;
      if (off) {
        sc.dead = true;
        if (sc.people.length > 1) {
          const n = sc.people.length - 1;
          penalty(`${n} FREELOADER${n > 1 ? 'S' : ''} ESCAPED!`, sc.dir > 0 ? W - 160 : 160, LANES[sc.lane].y - 90);
        }
      }
    }
    G.scooters = G.scooters.filter((s) => !s.dead);

    // sponges
    for (const sp of G.sponges) {
      const steps = 3;
      let hit = false;
      for (let i = 0; i < steps && !hit; i++) {
        sp.x += sp.vx * dt / steps;
        sp.y += sp.vy * dt / steps;
        hit = checkSpongeHit(sp);
      }
      sp.rot += dt * 14;
      sp.life -= dt;
      if (hit) { sp.dead = true; continue; }
      const splatWall = sp.y < 130 && sp.vy < 0;
      if (splatWall || sp.x < -30 || sp.x > W + 30 || sp.y > H + 30 || sp.life <= 0) {
        sp.dead = true;
        if (splatWall) { splash(sp.x, sp.y, 8); Sfx.splat(); }
        if (G.combo >= 2) popup('combo lost', sp.x, Math.max(sp.y, 40), '#cccccc', 14);
        G.combo = 0;
      }
    }
    G.sponges = G.sponges.filter((s) => !s.dead);

    // passengers flying off into orbit
    for (const f of G.flyers) {
      f.vy += 500 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      f.p.bubbleT -= dt;
      if (f.y < -40) {
        f.dead = true;
        G.parts.push({ type: 'star', x: clamp(f.x, 20, W - 20), y: 16, vx: 0, vy: 0, g: 0, life: 0.7, max: 0.7, r: 10, color: '#fff' });
      } else if (f.y > H + 120 || f.x < -200 || f.x > W + 200) f.dead = true;
    }
    G.flyers = G.flyers.filter((f) => !f.dead);

    // trash
    let landed = 0;
    for (const tr of G.trash) {
      if (!tr.landed) {
        tr.t += dt;
        tr.vy += tr.g * dt;
        tr.x += tr.vx * dt;
        tr.y += tr.vy * dt;
        tr.rot += tr.vr * dt;
        if (tr.t >= tr.T) {
          tr.x = tr.tx; tr.y = tr.ty; tr.landed = true; tr.age = 0;
          Sfx.trashLand();
          dust(tr.x, tr.y, 3);
          if (!G.demo && !G.litterHint) { // first litter of the game: explain the mechanic
            G.litterHint = true;
            popup('LITTER! Walk Boris over it', tr.x, tr.y - 40, '#ffe066', 16, 2.6);
            cleanerSay('Litter! I must sweep it up.');
          }
        }
        continue;
      }
      tr.age += dt;
      const ex = (tr.x - c.x) / SWEEP_RX, ey = (tr.y - c.y) / SWEEP_RY;
      if (!G.demo && ex * ex + ey * ey <= 1) {
        tr.dead = true;
        G.score += 25;
        G.swept++;
        c.sweepT = 0.35;
        dust(tr.x, tr.y, 8);
        popup('+25 SWEPT!', tr.x, tr.y - 34, '#ffe066', 17, 0.9);
        Sfx.coin();
        // the piece flies into the city cart so you can see where it went
        G.binned.push({ x: tr.x, y: tr.y, sx: tr.x, sy: tr.y, t: 0, T: 0.55, type: tr.type, rot: tr.rot });
        continue;
      }
      landed++;
    }
    G.trash = G.trash.filter((t) => !t.dead);
    for (const b of G.binned) {
      b.t += dt;
      const k = Math.min(1, b.t / b.T);
      b.x = b.sx + (CART.x - b.sx) * k;
      b.y = b.sy + (CART.y - b.sy) * k - Math.sin(k * Math.PI) * 90;
      b.rot += dt * 14;
      if (k >= 1) { b.dead = true; G.cartBump = 0.25; }
    }
    G.binned = G.binned.filter((b) => !b.dead);
    G.cartBump = Math.max(0, G.cartBump - dt);
    if (!G.demo && landed >= LITTER_MAX) {
      for (const tr of G.trash) if (tr.landed) { tr.dead = true; dust(tr.x, tr.y, 4); }
      G.trash = G.trash.filter((t) => !t.dead);
      penalty('TOO MUCH LITTER!', c.x, c.y - 120);
    }

    // bubbles
    for (const sc of G.scooters) for (const p of sc.people) p.bubbleT -= dt;

    // particles & popups
    for (const p of G.parts) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    G.parts = G.parts.filter((p) => p.life > 0);
    for (const p of G.pops) { p.y -= 32 * dt; p.life -= dt; }
    G.pops = G.pops.filter((p) => p.life > 0);

    G.shake = Math.max(0, G.shake - dt * 40);
    G.bannerT -= dt;
    if (G.overT > 0) {
      G.overT -= dt;
      if (G.overT <= 0) gameOver();
    }
  }

  // ---------------------------------------------------------------- drawing: world
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, '#8ec5fc');
    sky.addColorStop(1, '#f6d5f7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 160);
    circle(820, 50, 26, '#ffe066', null);

    for (const cl of CLOUDS) {
      const x = ((cl.x + G.t * cl.v) % (W + 200)) - 100;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.ellipse(x, cl.y, 34 * cl.s, 12 * cl.s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 18 * cl.s, cl.y - 8 * cl.s, 20 * cl.s, 12 * cl.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const b of BUILDINGS) {
      const top = 140 - b.h;
      ctx.fillStyle = b.c;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillRect(b.x, top, b.w, b.h);
      ctx.strokeRect(b.x, top, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(b.x - 3, top - 5, b.w + 6, 6);
      for (const w of b.win) {
        ctx.fillStyle = w.lit ? '#ffe8a3' : '#3a4a5c';
        ctx.fillRect(b.x + 10 + w.c * 22, top + 10 + w.r * 22, 12, 14);
      }
      if (b.sign) {
        ctx.fillStyle = b.signC;
        rrect(b.x + 8, 114, b.w - 16, 17, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.sign, b.x + b.w / 2, 123);
      }
    }

    // far sidewalk
    ctx.fillStyle = '#b9b1a3';
    ctx.fillRect(0, 140, W, 22);
    ctx.fillStyle = '#8d877c';
    ctx.fillRect(0, 160, W, 5);
    // road
    ctx.fillStyle = '#4a4a57';
    ctx.fillRect(0, 165, W, 255);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(210, 330, 50, 9, 0, 0, Math.PI * 2); ctx.fill(); // puddle-ish patches
    ctx.beginPath(); ctx.ellipse(700, 240, 36, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([26, 22]);
    line(0, 257, W, 257, '#e8e8e8', 3);
    line(0, 342, W, 342, '#e8e8e8', 3);
    ctx.setLineDash([]);
    // near curb + sidewalk
    ctx.fillStyle = '#9a948a';
    ctx.fillRect(0, 420, W, 12);
    ctx.fillStyle = '#d6cfc0';
    ctx.fillRect(0, 432, W, H - 432);
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 64) line(x, 432, x - 20, H, 'rgba(0,0,0,.12)', 2);
    line(0, 488, W, 488, 'rgba(0,0,0,.10)', 2);

    // the city trash cart (swept litter flies in here)
    ctx.save();
    const bump = Math.sin(G.cartBump * 40) * G.cartBump * 12;
    ctx.translate(0, -Math.abs(bump));
    ctx.fillStyle = '#5f7f5f';
    rrect(18, 446, 50, 38, 5);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
    circle(28, 488, 5, '#333');
    circle(58, 488, 5, '#333');
    ctx.fillStyle = '#fff';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CITY', 43, 465);
    ctx.restore();
  }

  function drawScooter(sc) {
    const L = LANES[sc.lane], s = L.s;
    ctx.save();
    ctx.translate(sc.x, L.y);
    if (!sc.crashed) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 52 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = clamp(1 - (sc.crashT - 1.4) / 0.6, 0, 1);
      ctx.translate(0, -14 * s);
      ctx.rotate(sc.rot);
      ctx.translate(0, 14 * s);
    }
    ctx.scale(sc.dir * s, s);
    const back = sc.deckBack, front = 36;
    // deck
    ctx.fillStyle = sc.color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    rrect(back, -17, front - back, 6, 3);
    ctx.fill();
    ctx.stroke();
    // stem + handlebar
    limb(front - 2, -14, front - 8, -64, '#b0b0b8', 3);
    limb(front - 16, -64, front + 2, -64, '#333', 3);
    // wheels
    circle(back + 6, -7, 7, '#222', INK, 2);
    circle(front + 2, -7, 7, '#222', INK, 2);
    circle(back + 6, -7, 2.5, '#aaa', null);
    circle(front + 2, -7, 2.5, '#aaa', null);
    ctx.restore();
  }

  function drawPerson(p, x, y, s, dir, pose, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) {
      ctx.translate(0, -34 * s);
      ctx.rotate(rot);
      ctx.translate(0, 34 * s);
    }
    ctx.scale(dir * s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const flail = pose === 'flail';

    // big hair behind the head
    if (p.style === 4 && p.hat !== 'helmet') circle(-1, -57, 12, p.hair);
    if (p.style === 2 && p.hat !== 'helmet') {
      ctx.fillStyle = p.hair;
      rrect(-10, -60, 9, 20, 4);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // courier's insulated delivery box, strapped to the back
    if (p.courier) {
      ctx.save();
      if (flail) { ctx.translate(-14, -46); ctx.rotate(-0.35); ctx.translate(14, 46); }
      ctx.fillStyle = p.courier.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      rrect(-31, -68, 24, 26, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; // lid
      ctx.fillRect(-30, -67, 22, 5);
      line(-31, -62, -7, -62, INK, 1.5);
      ctx.save();
      ctx.translate(-19, -51);
      ctx.scale(dir, 1); // un-mirror so the logo reads correctly both ways
      text(p.courier.name, 0, 0, p.courier.name.length > 3 ? 8 : 9, '#fff', 'center', 'middle');
      ctx.restore();
      ctx.restore();
    }

    // legs
    if (flail) {
      limb(-3, -22, -11, -4, p.pants, 5);
      limb(3, -22, 13, -8, p.pants, 5);
    } else {
      limb(-3, -22, -4, 0, p.pants, 5);
      limb(3, -22, 4, 0, p.pants, 5);
    }
    // torso
    ctx.fillStyle = p.shirt;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    rrect(-9, -46, 18, 25, 6);
    ctx.fill();
    ctx.stroke();
    if (p.scruffy) {
      ctx.fillStyle = 'rgba(60,40,20,.55)';
      for (const st of p.stains) { ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#9c8a5a'; // patch on the knee
      ctx.fillRect(flail ? 7 : 1, -14, 5, 5);
      line(-9, -24, -5, -21, INK, 1.5); // torn hem
      line(-5, -21, -2, -25, INK, 1.5);
    }

    // arms
    if (flail) {
      limb(-4, -42, -14, -60, p.skin, 4);
      limb(4, -42, 15, -62, p.skin, 4);
    } else if (pose === 'rider') {
      limb(2, -42, 17, -38, p.skin, 4);
    } else {
      limb(2, -42, 17, -40, p.skin, 4); // clinging to whoever is in front
      if (p.item) {
        limb(-2, -42, -9, -53, p.skin, 4);
        if (p.item === 'coffee') {
          ctx.fillStyle = '#fff';
          rrect(-13, -63, 8, 10, 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#6d4c41';
          ctx.fillRect(-13, -63, 8, 3);
        } else if (p.item === 'phone') {
          ctx.fillStyle = '#222';
          rrect(-13, -64, 7, 11, 2);
          ctx.fill();
          ctx.fillStyle = '#8ef';
          ctx.fillRect(-12, -63, 5, 8);
          if (p.scruffy) { line(-12, -62, -8, -57, '#fff', 1); line(-10, -59, -12, -56, '#fff', 1); } // cracked
        } else if (p.item === 'bottle') { // in a paper bag, naturally
          ctx.fillStyle = '#2e7d32';
          ctx.fillRect(-11, -70, 4, 7);
          ctx.fillStyle = '#c8a165';
          rrect(-14, -64, 10, 13, 2);
          ctx.fill();
          ctx.stroke();
        } else if (p.item === 'chicken') { // a whole drumstick
          circle(-10, -60, 5, '#c97b2a');
          limb(-10, -56, -8, -51, '#f5f0e0', 2);
        } else {
          line(-9, -53, -14, -92, '#555', 1);
          circle(-14, -99, 8, '#ff4d6d');
        }
      }
    }
    if (flail && p.item === 'balloon') {
      line(15, -62, 22, -96, '#555', 1);
      circle(22, -103, 8, '#ff4d6d');
    }

    // head
    circle(1, -55, 9, p.skin);
    if (p.hat === 'helmet') {
      ctx.fillStyle = p.courier ? p.courier.color : '#f5f5f5';
      ctx.beginPath();
      ctx.arc(1, -56, 10.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = p.hair;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      if (p.style === 1 || p.style === 2 || p.style === 4) {
        ctx.beginPath();
        ctx.arc(1, -56, 9.5, Math.PI * 1.05, Math.PI * 1.9);
        ctx.lineTo(1, -58);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.style === 3) {
        ctx.beginPath();
        ctx.moveTo(-7, -60);
        for (let i = 0; i < 4; i++) {
          ctx.lineTo(-5 + i * 4, -72);
          ctx.lineTo(-3 + i * 4, -62);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      if (p.style === 5) { // bed-head
        ctx.beginPath();
        ctx.moveTo(-9, -55);
        const tufts = [[-10, -66], [-5, -62], [-3, -70], [1, -63], [5, -69], [6, -62], [11, -64], [9, -57]];
        for (const [tx, ty] of tufts) ctx.lineTo(tx, ty);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      if (p.hat === 'beanie') {
        ctx.fillStyle = p.shirt;
        ctx.beginPath();
        ctx.arc(1, -57, 10, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ddd';
        ctx.fillRect(-9, -59, 20, 3);
        circle(1, -68, 3, '#ddd', INK, 1.5); // pompom
      }
      if (p.hat === 'cap') {
        ctx.fillStyle = p.shirt;
        ctx.beginPath();
        ctx.arc(1, -58, 9, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(4, -60, 11, 3);
        ctx.strokeRect(4, -60, 11, 3);
      }
    }
    if (p.scruffy) { // stubble + dirt smudge
      ctx.fillStyle = 'rgba(40,30,20,.6)';
      for (let i = 0; i < 6; i++) ctx.fillRect(1 + (i % 3) * 2.5, -50 + Math.floor(i / 3) * 2.2, 1.2, 1.2);
      ctx.fillStyle = 'rgba(70,50,30,.35)';
      ctx.beginPath(); ctx.arc(-3, -53, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // face
    if (flail) {
      circle(5, -56, 2.5, '#fff', INK, 1);
      circle(5, -56, 1, INK, null);
      circle(6, -49, 2.5, '#3a1010', null);
    } else {
      circle(5, -56, 1.3, INK, null);
      line(4, -50, 8, -50, INK, 1.5);
    }
    if (p.scruffy) {
      const t = performance.now() / 1000 + p.phase;
      ctx.strokeStyle = 'rgba(120,170,60,.75)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) ctx.lineTo(-6 + i * 10 + Math.sin(t * 6 + k + i * 2) * 2, -70 - k * 3);
        ctx.stroke();
      }
      ctx.fillStyle = INK; // a couple of loyal flies
      for (let i = 0; i < 2; i++) {
        const a = t * (5 + i * 2) + i * 3;
        ctx.beginPath();
        ctx.arc(1 + Math.cos(a) * 15, -60 + Math.sin(a * 1.3) * 9, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawCleaner(c) {
    const s = 1.15, f = c.face;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(f * s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const step = Math.sin(c.walk) * 6;

    // broom (behind body), wiggles while sweeping
    ctx.save();
    ctx.translate(-12, -44);
    ctx.rotate(c.sweepT > 0 ? Math.sin(c.sweepT * 40) * 0.4 : -0.15);
    limb(4, -34, -8, 40, '#a0522d', 3);
    ctx.fillStyle = '#e9c46a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 38);
    ctx.lineTo(-2, 38);
    ctx.lineTo(2, 52);
    ctx.lineTo(-20, 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // legs + boots
    limb(-5, -30, -5 + step, -2, '#2b4c7e', 6);
    limb(5, -30, 5 - step, -2, '#2b4c7e', 6);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(-3 + step, 0, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7 - step, 0, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // back arm on the broom
    limb(-6, -56, -12, -44, '#f1c27d', 5);

    // hi-vis vest
    ctx.fillStyle = '#ff7a00';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    rrect(-13, -64, 26, 36, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff36b';
    ctx.fillRect(-12, -53, 24, 4);
    ctx.fillRect(-12, -43, 24, 4);

    // head, cap, glorious mustache
    circle(1, -75, 11, '#f1c27d');
    ctx.fillStyle = '#ff7a00';
    ctx.beginPath();
    ctx.arc(1, -78, 11, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(4, -80, 14, 4);
    ctx.strokeRect(4, -80, 14, 4);
    circle(6, -75, 1.6, INK, null);
    circle(12, -72, 2.6, '#e0a96d', INK, 1.5);
    ctx.fillStyle = '#4a2c18';
    ctx.beginPath();
    ctx.ellipse(8, -67.5, 7, 2.8, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // throwing arm
    let hx = 12, hy = -40;
    if (c.throwT > 0) {
      const a = Math.atan2(mouse.y - (c.y - 56 * s), (mouse.x - c.x) * f);
      hx = 6 + Math.cos(a) * 22;
      hy = -56 + Math.sin(a) * 22;
    }
    limb(6, -56, hx, hy, '#f1c27d', 5);
    ctx.restore();
  }

  function drawSponge(sp) {
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(sp.rot);
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    rrect(-7, -5, 14, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a9d8f';
    ctx.fillRect(-6, -4, 12, 3);
    ctx.restore();
  }

  function drawTrash(tr) {
    if (tr.landed && !G.demo) {
      const near = Math.hypot((tr.x - G.cleaner.x) / SWEEP_RX, (tr.y - G.cleaner.y) / SWEEP_RY) < 2.2;
      const pulse = 0.5 + 0.5 * Math.sin(G.t * 8 + tr.x);
      ctx.strokeStyle = near ? '#3ddc84' : `rgba(255,214,0,${0.45 + pulse * 0.5})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(tr.x, tr.y + 2, 13 + pulse * 3, 6 + pulse * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (tr.age > 4) { // old litter starts to stink
        ctx.strokeStyle = 'rgba(120,170,60,.8)';
        ctx.lineWidth = 1.5;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) ctx.lineTo(tr.x + i * 6 + Math.sin(G.t * 6 + k + i) * 2, tr.y - 10 - k * 3);
          ctx.stroke();
        }
      }
    }
    if (tr.landed) {
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ctx.beginPath();
      ctx.ellipse(tr.x, tr.y + 3, 8, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.rot);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    if (tr.type === 0) { // can
      ctx.fillStyle = '#e63946';
      rrect(-4, -6, 8, 12, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ddd';
      ctx.fillRect(-4, -6, 8, 2);
    } else if (tr.type === 1) { // banana peel
      ctx.strokeStyle = '#f4d03f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 6, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      circle(0, 4, 2.5, '#f4d03f', INK, 1);
    } else if (tr.type === 2) { // coffee cup
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-5, -7); ctx.lineTo(5, -7); ctx.lineTo(3.5, 7); ctx.lineTo(-3.5, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(-6, -9, 12, 3);
    } else { // crumpled paper
      circle(0, 0, 5.5, '#f1f1f1', INK, 1.5);
      line(-3, -1, 2, 2, '#999', 1);
      line(-1, -3, 3, -2, '#999', 1);
    }
    ctx.restore();
  }

  function drawBubble(msg, x, y) {
    ctx.font = `bold 13px ${FONT}`;
    const w = ctx.measureText(msg).width + 16, h = 22;
    const bx = clamp(x - w / 2, 4, W - w - 4), by = Math.max(4, y - h);
    const tx = clamp(x, bx + 10, bx + w - 10);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    rrect(bx, by, w, h, 9);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 5, by + h - 1);
    ctx.lineTo(tx, by + h + 7);
    ctx.lineTo(tx + 5, by + h - 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(tx - 4, by + h - 3, 8, 3);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, bx + w / 2, by + h / 2 + 1);
  }

  function drawParticles() {
    for (const p of G.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.type === 'star') {
        const r = p.r * (1.5 - a);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? r * 0.3 : r;
          const ang = i * Math.PI / 4;
          ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        circle(p.x, p.y, p.r, p.color, null);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawWorld() {
    drawBackground();

    // lanes far to near
    for (let li = 0; li < LANES.length; li++) {
      for (const sc of G.scooters) {
        if (sc.lane !== li) continue;
        drawScooter(sc);
        for (let i = sc.people.length - 1; i >= 0; i--) {
          const q = personPos(sc, i);
          drawPerson(sc.people[i], q.x, q.y, q.s, sc.dir, i === 0 ? 'rider' : 'passenger');
        }
      }
    }

    if (state === 'play' && G.trash.some((t) => t.landed)) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(61,220,132,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(G.cleaner.x, G.cleaner.y, SWEEP_RX, SWEEP_RY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const tr of G.trash) if (tr.landed) drawTrash(tr);
    drawCleaner(G.cleaner);
    for (const b of G.binned) drawTrash({ x: b.x, y: b.y, rot: b.rot, type: b.type, landed: false });
    for (const tr of G.trash) if (!tr.landed) drawTrash(tr);
    for (const f of G.flyers) drawPerson(f.p, f.x, f.y, f.s, f.dir, 'flail', f.rot);
    for (const sp of G.sponges) drawSponge(sp);
    drawParticles();

    // speech bubbles on top of everything
    for (const sc of G.scooters) {
      sc.people.forEach((p, i) => {
        if (p.bubbleT > 0 && p.bubble) {
          const q = personPos(sc, i);
          drawBubble(p.bubble, q.x, q.y - 74 * q.s);
        }
      });
    }
    for (const f of G.flyers) if (f.p.bubbleT > 0 && f.p.bubble) drawBubble(f.p.bubble, f.x, f.y - 80 * f.s);
    const c = G.cleaner;
    if (c.quipT > 0 && c.quip && state !== 'title') drawBubble(c.quip, c.x, c.y - 104);

    for (const p of G.pops) {
      ctx.globalAlpha = clamp(p.life / p.max * 2, 0, 1);
      text(p.msg, p.x, p.y, p.size, p.color, 'center', 'middle');
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- drawing: UI
  function drawHUD() {
    text(`SCORE ${G.score}`, 16, 34, 26, '#fff');
    if (G.combo >= 2) {
      const mult = Math.min(5, 1 + Math.floor((G.combo - 1) / 2));
      text(`COMBO ${G.combo}  (x${mult})`, 16, 60, 18, '#ffe066');
    }

    text('REPUTATION', W - 16, 24, 13, '#fff', 'right');
    for (let i = 0; i < MAX_HEARTS; i++) {
      text('♥', W - 22 - i * 26, 52, 26, i < G.hearts ? '#ff4d6d' : '#555', 'center');
    }

    text(`Swept: ${G.swept}`, 16, G.combo >= 2 ? 82 : 58, 14, '#ffe066');
    const landed = G.trash.filter((t) => t.landed).length;
    text(`LITTER ${landed}/${LITTER_MAX}`, W / 2 - 62, 26, 13, '#fff', 'right');
    if (landed >= LITTER_MAX - 3 && Math.floor(G.t * 3) % 2 === 0) {
      text('Sidewalk is filthy! Walk over the glowing litter!', W / 2, 46, 14, '#ff8a8a', 'center', 'middle');
    }
    for (let i = 0; i < LITTER_MAX; i++) {
      ctx.fillStyle = i < landed ? (landed >= LITTER_MAX - 2 ? '#ff4d6d' : '#c9a227') : 'rgba(255,255,255,.35)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      rrect(W / 2 - 54 + i * 15, 14, 11, 14, 2);
      ctx.fill();
      ctx.stroke();
    }

    text('M mute · P pause', W - 12, H - 10, 12, 'rgba(255,255,255,.8)', 'right');
    if (Sfx.muted) text('🔇', W - 130, H - 10, 12, '#fff', 'right');

    if (G.bannerT > 0) {
      ctx.globalAlpha = clamp(G.bannerT, 0, 1);
      text('LAW: ONE PERSON PER SCOOTER!', W / 2, 200, 34, '#ffe066', 'center', 'middle');
      text('Splash the extra passengers. Spare the driver!', W / 2, 240, 20, '#fff', 'center', 'middle');
      ctx.globalAlpha = 1;
    }
  }

  function drawCrosshair() {
    const { x, y } = mouse;
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
    line(x - 17, y, x - 6, y, '#fff', 2);
    line(x + 6, y, x + 17, y, '#fff', 2);
    line(x, y - 17, x, y - 6, '#fff', 2);
    line(x, y + 6, x, y + 17, '#fff', 2);
    circle(x, y, 2, '#ff4d6d', null);
  }

  function panel() {
    ctx.fillStyle = 'rgba(20,20,28,.72)';
    ctx.fillRect(0, 0, W, H);
  }

  function rankFor(score) {
    if (score < 500) return 'Puddle Intern';
    if (score < 1500) return 'Junior Broom Operator';
    if (score < 3000) return 'Senior Sidewalk Officer';
    if (score < 6000) return 'Sponge Sniper';
    return 'Supreme Sovereign of the Sidewalk';
  }

  function drawTitle() {
    panel();
    const bob = Math.sin(performance.now() / 300) * 4;
    text('STREET SWEEPER', W / 2, 110 + bob, 64, '#ff7a00', 'center', 'middle');
    text('vs. the Scooter Freeloaders', W / 2, 165, 26, '#fff', 'center', 'middle');
    const lines = [
      'You are Boris, municipal street cleaner. The city has ONE rule:',
      'ONE PERSON PER SCOOTER.',
      'Throw wet sponges at the EXTRA passengers. Never splash the driver!',
      'Riders toss litter (glowing rings). Walk Boris over it to sweep it into the cart.',
    ];
    lines.forEach((l, i) => text(l, W / 2, 225 + i * 32, i === 1 ? 24 : 18, i === 1 ? '#ffe066' : '#fff', 'center', 'middle'));
    if (Tilt.touch) {
      text('TILT the phone — walk     TAP — throw a sponge', W / 2, 365, 18, '#9dd8ff', 'center', 'middle');
      text('Hold the phone comfortably when you start: that pose is "standing still".', W / 2, 392, 14, '#fff', 'center', 'middle');
    } else {
      text('WASD / Arrows — move     Mouse — aim     Click / Space — throw', W / 2, 375, 16, '#9dd8ff', 'center', 'middle');
    }
    if (Math.floor(performance.now() / 500) % 2 === 0) text(Tilt.touch ? 'TAP TO START' : 'CLICK TO START', W / 2, 440, 30, '#9dff6b', 'center', 'middle');
    if (best > 0) text(`Best: ${best}`, W / 2, 485, 16, '#fff', 'center', 'middle');
  }

  function drawPaused() {
    panel();
    text('PAUSED', W / 2, H / 2 - 20, 56, '#ffe066', 'center', 'middle');
    text('Boris is on his coffee break. Click or press P.', W / 2, H / 2 + 30, 20, '#fff', 'center', 'middle');
  }

  function drawOver() {
    panel();
    text("YOU'RE FIRED!", W / 2, 120, 64, '#ff4d6d', 'center', 'middle');
    text('The city received too many complaints.', W / 2, 172, 20, '#fff', 'center', 'middle');
    text(`SCORE ${G.score}`, W / 2, 235, 40, '#ffe066', 'center', 'middle');
    text(`Rank: ${rankFor(G.score)}`, W / 2, 280, 22, '#9dff6b', 'center', 'middle');
    text(`Freeloaders splashed: ${G.splashed}    Litter swept: ${G.swept}    Best combo: ${G.bestCombo}`, W / 2, 325, 17, '#fff', 'center', 'middle');
    text(`Best score: ${best}`, W / 2, 360, 17, '#fff', 'center', 'middle');
    if (overClickT <= 0 && Math.floor(performance.now() / 500) % 2 === 0) {
      text('CLICK TO GET YOUR JOB BACK', W / 2, 430, 28, '#9dd8ff', 'center', 'middle');
    }
  }

  function draw() {
    const scale = canvas.width / W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake), rand(-G.shake, G.shake));
    drawWorld();
    ctx.restore();

    if (state === 'play' || state === 'paused') drawHUD();
    if (state === 'title') drawTitle();
    if (state === 'paused') drawPaused();
    if (state === 'over') drawOver();
    if (state === 'play') drawCrosshair();
  }

  // ---------------------------------------------------------------- loop
  newGame(true);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'play') Music.start();
    else Music.stop();
    if (state !== 'paused') update(dt);
    if (state === 'over') overClickT -= dt;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
