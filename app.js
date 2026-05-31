/* FFT 魔法 · Fourier Magic
 * 手機教學 demo：頻率積木、聲音頻譜+濾波、畫圖旋轉向量、方波合成。
 * 每個 demo 都有引導步驟，可調參數，邊玩邊理解 FFT。
 */
'use strict';

/* ---------------------------------------------------------------- helpers */

// 將 canvas 按裝置像素比放大，喺 retina 螢幕都清晰。
function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function freqToNote(freq) {
  if (!freq || freq <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return name + octave;
}

const PALETTE = ['#5b8cff', '#36e0c0', '#ff5b8c', '#ffc24b'];

/* ----------------------------------------------------------------- tabs */

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('is-active'));
    panels.forEach(p => p.classList.remove('is-active'));
    tab.classList.add('is-active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('is-active');
    onTabChange(tab.dataset.tab);
  });
});

function onTabChange(name) {
  if (name !== 'mic') Mic.stop();
  if (name === 'blocks') Blocks.redraw();
  if (name === 'draw') Draw.redraw();
  if (name === 'wave') Wave.redraw();
}

/* --------------------------------------------------- guide (step walkthrough) */

const GUIDES = {
  blocks: [
    '上面係波形（隨時間嘅高低起伏），下面係頻譜（裡面有邊啲頻率）。佢哋係同一件事嘅兩種樣。',
    '拖第一個波嘅「頻率」掣 → 睇下面條柱點樣左右移。頻率 = 條柱嘅位置。',
    '拖「振幅」掣 → 條柱會變高變矮。振幅 = 條柱嘅高度，即係嗰個頻率有幾大力。',
    '撳「➕ 加一個正弦波」→ 上面波形變複雜咗，但下面只係多咗一條柱。',
    'FFT 做嘅就係反過嚟：俾佢上面個複雜波，佢幫你讀返下面嗰幾條柱。撳「▶ 聽呢個波」聽埋落去。',
  ],
  mic: [
    '撳「開始聆聽」，准許麥克風權限。',
    '吹口哨或者唱「Aaa」→ 睇邊條最高（最光）嗰條柱，就係你把聲嘅主頻率。',
    '唱高音條柱向右移、低音向左移；上面數字同右邊音符會跟住變。',
    '試下撳「低通」，再喺頻譜上左右拖手指調 cutoff → 睇住高頻被切走。撳「🎧 試聽」（建議戴耳機）聽把聲變鈍。',
  ],
  draw: [
    '用手指喺畫布上畫一個閉合形狀（首尾大致接返埋）。',
    '撳「➕ 多一個向量」，由 1 個圓圈開始，一個一個咁加。',
    '每加一個向量 = 加一個頻率（一個旋轉圈）。留意頭幾個已經好似個輪廓。',
    '拖「向量數量」到底或者撳「播放重建」，睇全部向量一齊轉，砌返你個圖。',
  ],
  wave: [
    '而家得 1 個正弦波，即係一個純音。',
    '拖「諧波數量」加上去 → 波形越嚟越似一個方波。',
    '留意只有奇數（1, 3, 5…）會被加入，而且越高頻嘅力越細。',
    '撳「▶ 聽聲音」→ 諧波越多，音色越「沙」，越似 buzzer 嘅方波聲。',
  ],
};

document.querySelectorAll('.guide').forEach(el => {
  const key = el.dataset.guide;
  const steps = GUIDES[key];
  const text = el.querySelector('.guide-text');
  const count = el.querySelector('.guide-count');
  let i = 0;
  function render() {
    text.textContent = steps[i];
    count.textContent = `${i + 1} / ${steps.length}`;
    el.querySelector('.guide-prev').disabled = i === 0;
    el.querySelector('.guide-next').disabled = i === steps.length - 1;
  }
  el.querySelector('.guide-prev').addEventListener('click', () => { if (i > 0) { i--; render(); } });
  el.querySelector('.guide-next').addEventListener('click', () => { if (i < steps.length - 1) { i++; render(); } });
  render();
});

/* =================================================================
 * 1) 頻率積木 — 時域 ↔ 頻域 雙視窗（合成 = FFT 嘅相反）
 * ================================================================= */

const Blocks = (() => {
  const timeCanvas = document.getElementById('blkTime');
  const freqCanvas = document.getElementById('blkFreq');
  const compsEl = document.getElementById('blkComps');
  const addBtn = document.getElementById('blkAdd');
  const playBtn = document.getElementById('blkPlay');
  const mathEl = document.getElementById('blkMath');

  const MAX_FREQ = 12;
  let comps = [{ freq: 2, amp: 0.8 }];   // {freq 1..12, amp 0..1}
  let audioCtx, osc, gain, playing = false;

  function renderControls() {
    compsEl.innerHTML = '';
    comps.forEach((c, idx) => {
      const color = PALETTE[idx % PALETTE.length];
      const row = document.createElement('div');
      row.className = 'comp';
      row.innerHTML =
        `<div class="comp-top">
           <span class="comp-dot" style="background:${color}"></span>
           <span class="comp-name">波 ${idx + 1}</span>
           ${comps.length > 1 ? '<button type="button" class="comp-remove">✕</button>' : ''}
         </div>
         <div class="comp-slider">
           <label>頻率</label>
           <input type="range" class="f" min="1" max="${MAX_FREQ}" step="1" value="${c.freq}">
           <span class="val">${c.freq}×</span>
         </div>
         <div class="comp-slider">
           <label>振幅</label>
           <input type="range" class="a" min="0" max="100" step="1" value="${Math.round(c.amp * 100)}">
           <span class="val">${Math.round(c.amp * 100)}%</span>
         </div>`;
      const fIn = row.querySelector('.f'), aIn = row.querySelector('.a');
      const fVal = row.querySelector('.comp-slider .val');
      const aVal = row.querySelectorAll('.comp-slider .val')[1];
      fIn.addEventListener('input', () => { c.freq = +fIn.value; fVal.textContent = c.freq + '×'; sync(); });
      aIn.addEventListener('input', () => { c.amp = +aIn.value / 100; aVal.textContent = aIn.value + '%'; sync(); });
      const rm = row.querySelector('.comp-remove');
      if (rm) rm.addEventListener('click', () => { comps.splice(idx, 1); renderControls(); sync(); });
      compsEl.appendChild(row);
    });
    addBtn.disabled = comps.length >= PALETTE.length;
  }

  function value(t) {                       // t in [0,1]
    let s = 0;
    for (const c of comps) s += c.amp * Math.sin(2 * Math.PI * c.freq * t);
    return s;
  }

  function drawTime() {
    const { ctx, w, h } = fitCanvas(timeCanvas);
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2, scale = h * 0.18;     // 4 個振幅 1 都唔會爆
    ctx.strokeStyle = 'rgba(138,147,173,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

    // 每個分量（淡色）
    comps.forEach((c, idx) => {
      ctx.strokeStyle = PALETTE[idx % PALETTE.length] + '66';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let px = 0; px <= w; px++) {
        const y = mid - c.amp * Math.sin(2 * Math.PI * c.freq * (px / w)) * scale;
        px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
      }
      ctx.stroke();
    });

    // 總和（亮白）
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const y = mid - value(px / w) * scale;
      px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
    }
    ctx.stroke();
  }

  function drawFreq() {
    const { ctx, w, h } = fitCanvas(freqCanvas);
    ctx.clearRect(0, 0, w, h);
    const pad = 24, baseY = h - pad, slot = (w - pad) / MAX_FREQ;

    // 軸
    ctx.strokeStyle = 'rgba(138,147,173,0.3)';
    ctx.beginPath(); ctx.moveTo(pad, baseY); ctx.lineTo(w, baseY); ctx.stroke();

    // 每個頻率一格，邊個有分量就有條柱
    for (let f = 1; f <= MAX_FREQ; f++) {
      const x = pad + (f - 0.5) * slot;
      ctx.fillStyle = '#586079';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f, x, h - 6);
    }
    comps.forEach((c, idx) => {
      const x = pad + (c.freq - 0.5) * slot;
      const barH = c.amp * (baseY - 10);
      const bw = Math.min(slot * 0.5, 26);
      ctx.fillStyle = PALETTE[idx % PALETTE.length];
      ctx.fillRect(x - bw / 2, baseY - barH, bw, barH);
    });
  }

  function updateMath() {
    const parts = comps.map((c, i) => `${(c.amp).toFixed(2)}·sin(2π·${c.freq}t)`).join(' + ');
    mathEl.innerHTML = `f(t) = <var>${parts || '0'}</var><br>` +
      `頻譜：<var>${comps.length}</var> 條柱，分別喺頻率 <var>${comps.map(c => c.freq).join(', ')}</var>。`;
  }

  function buildWave(ctx) {                 // 用各分量做 PeriodicWave（諧波合成）
    const n = MAX_FREQ + 1;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (const c of comps) imag[c.freq] += c.amp;
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  function play() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    osc = audioCtx.createOscillator();
    gain = audioCtx.createGain();
    gain.gain.value = 0.16;
    osc.setPeriodicWave(buildWave(audioCtx));
    osc.frequency.value = 165;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    playing = true;
    playBtn.textContent = '⏹ 停止';
  }
  function stop() {
    if (osc) osc.stop();
    if (audioCtx) audioCtx.close();
    osc = audioCtx = gain = null;
    playing = false;
    playBtn.textContent = '▶ 聽呢個波';
  }

  function sync() {
    drawTime(); drawFreq(); updateMath();
    if (playing && osc) osc.setPeriodicWave(buildWave(audioCtx));
  }
  function redraw() { drawTime(); drawFreq(); updateMath(); }

  addBtn.addEventListener('click', () => {
    if (comps.length >= PALETTE.length) return;
    const used = comps.map(c => c.freq);
    let f = 1; while (used.includes(f) && f < MAX_FREQ) f++;
    comps.push({ freq: f, amp: 0.5 });
    renderControls(); sync();
  });
  playBtn.addEventListener('click', () => (playing ? stop() : play()));

  renderControls();
  return { redraw };
})();

/* =================================================================
 * 2) 聲音頻譜 + 互動濾波
 * ================================================================= */

const Mic = (() => {
  const canvas = document.getElementById('micCanvas');
  const toggleBtn = document.getElementById('micToggle');
  const freqEl = document.getElementById('micFreq');
  const noteEl = document.getElementById('micNote');
  const statusEl = document.getElementById('micStatus');
  const mathEl = document.getElementById('micMath');
  const seg = document.getElementById('micFilterSeg');
  const listenBtn = document.getElementById('micListen');

  let audioCtx, analyser, source, filter, monitorGain, stream, bins, raf;
  let running = false;
  let filterType = 'none';      // none | lowpass | highpass
  let cutoff = 1000;            // Hz
  let listening = false;
  const MAX_HZ = 4000;

  function buildGraph() {
    // source -> [filter] -> analyser ；試聽時 filter -> monitorGain -> 喇叭
    source.disconnect();
    if (filter) filter.disconnect();
    if (filterType === 'none') {
      source.connect(analyser);
      monitorGain.disconnect();
    } else {
      filter.type = filterType;
      filter.frequency.value = cutoff;
      source.connect(filter);
      filter.connect(analyser);
      monitorGain.disconnect();
      if (listening) filter.connect(monitorGain);
    }
    if (filterType === 'none' && listening) source.connect(monitorGain);
  }

  async function start() {
    try {
      statusEl.textContent = '正在要求麥克風權限…';
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.8;
      filter = audioCtx.createBiquadFilter();
      monitorGain = audioCtx.createGain();
      monitorGain.gain.value = 1;
      monitorGain.connect(audioCtx.destination);
      buildGraph();
      bins = new Uint8Array(analyser.frequencyBinCount);
      running = true;
      toggleBtn.textContent = '停止';
      statusEl.textContent = '聆聽緊… 開咗濾波後可以喺頻譜上左右拖手指調 cutoff。';
      loop();
    } catch (err) {
      statusEl.textContent = '無法存取麥克風：' + err.message;
    }
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (audioCtx) audioCtx.close();
    audioCtx = analyser = source = filter = monitorGain = stream = null;
    listening = false;
    listenBtn.classList.remove('is-on');
    toggleBtn.textContent = '開始聆聽';
    freqEl.textContent = noteEl.textContent = '—';
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    analyser.getByteFrequencyData(bins);

    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const sampleRate = audioCtx.sampleRate;
    const maxBin = Math.min(bins.length, Math.floor(MAX_HZ / (sampleRate / analyser.fftSize)));
    let peakVal = 0, peakBin = 0;
    const barW = w / maxBin;
    for (let i = 0; i < maxBin; i++) {
      const v = bins[i] / 255;
      if (bins[i] > peakVal) { peakVal = bins[i]; peakBin = i; }
      const barH = v * h;
      const hue = 200 - v * 160;
      ctx.fillStyle = `hsl(${hue}, 90%, ${30 + v * 35}%)`;
      ctx.fillRect(i * barW, h - barH, Math.max(barW - 0.5, 1), barH);
    }

    // 濾波 cutoff 線
    if (filterType !== 'none') {
      const cx = (cutoff / MAX_HZ) * w;
      ctx.strokeStyle = '#ff5b8c';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
      ctx.setLineDash([]);
      // 被切走嗰邊陰影
      ctx.fillStyle = 'rgba(255,91,140,0.12)';
      if (filterType === 'lowpass') ctx.fillRect(cx, 0, w - cx, h);
      else ctx.fillRect(0, 0, cx, h);
      ctx.fillStyle = '#ff5b8c';
      ctx.font = '12px sans-serif';
      ctx.textAlign = filterType === 'lowpass' ? 'left' : 'right';
      ctx.fillText(`cutoff ${Math.round(cutoff)}Hz`, filterType === 'lowpass' ? cx + 6 : cx - 6, 16);
    }

    const deltaF = (sampleRate / analyser.fftSize).toFixed(1);
    if (peakVal > 30) {
      const peakFreq = peakBin * sampleRate / analyser.fftSize;
      freqEl.textContent = Math.round(peakFreq);
      noteEl.textContent = freqToNote(peakFreq);
      mathEl.innerHTML =
        `f<sub>s</sub> = <var>${sampleRate}</var> Hz，N = <var>${analyser.fftSize}</var>，Δf = <var>${deltaF}</var> Hz/bin<br>` +
        `主峰 bin <var>k = ${peakBin}</var> → <var>${Math.round(peakFreq)}</var> Hz` +
        (filterType !== 'none' ? `　·　濾波：<var>${filterType === 'lowpass' ? '低通' : '高通'} @ ${Math.round(cutoff)}Hz</var>` : '');
    } else {
      mathEl.innerHTML = `f<sub>s</sub> = <var>${sampleRate}</var> Hz，Δf = <var>${deltaF}</var> Hz/bin　（出聲啲就會鎖定主峰）`;
    }
  }

  // 喺頻譜上拖手指調 cutoff
  function setCutoffFromEvent(e) {
    if (filterType === 'none') return;
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    const x = Math.max(0, Math.min(p.clientX - r.left, r.width));
    cutoff = Math.max(50, (x / r.width) * MAX_HZ);
    if (filter) filter.frequency.value = cutoff;
  }
  let dragging = false;
  canvas.addEventListener('mousedown', e => { dragging = true; setCutoffFromEvent(e); });
  canvas.addEventListener('mousemove', e => { if (dragging) setCutoffFromEvent(e); });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('touchstart', e => { dragging = true; setCutoffFromEvent(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { if (dragging) { setCutoffFromEvent(e); e.preventDefault(); } }, { passive: false });
  canvas.addEventListener('touchend', () => { dragging = false; });

  seg.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('is-on'));
      btn.classList.add('is-on');
      filterType = btn.dataset.filter;
      if (running) buildGraph();
    });
  });

  listenBtn.addEventListener('click', () => {
    listening = !listening;
    listenBtn.classList.toggle('is-on', listening);
    if (listening) statusEl.textContent = '🎧 試聽開咗 —— 建議戴耳機，否則可能會有回授（尖叫聲）。';
    if (running) buildGraph();
  });

  toggleBtn.addEventListener('click', () => (running ? stop() : start()));

  return { stop };
})();

/* =================================================================
 * 3) 畫圖 -> 旋轉向量（可逐個疊加）
 * ================================================================= */

const Draw = (() => {
  const canvas = document.getElementById('drawCanvas');
  const clearBtn = document.getElementById('drawClear');
  const playBtn = document.getElementById('drawPlay');
  const slider = document.getElementById('termsSlider');
  const termsVal = document.getElementById('termsVal');
  const mathEl = document.getElementById('drawMath');
  const stepUp = document.getElementById('drawStepUp');
  const stepDown = document.getElementById('drawStepDown');

  let points = [], coeffs = [];
  let drawing = false, animating = false;
  let t = 0, raf, trace = [];
  const N = 256;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }

  function startDraw(e) {
    e.preventDefault();
    stopAnim();
    points = []; coeffs = []; trace = [];
    drawing = true;
    points.push(pos(e));
    redraw();
  }
  function moveDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    points.push(pos(e));
    redraw();
  }
  function endDraw() {
    if (!drawing) return;
    drawing = false;
    if (points.length > 2) {
      coeffs = computeDFT(resample(points, N));
      slider.max = coeffs.length;
      slider.value = 1;
      termsVal.textContent = 1;
      playBtn.disabled = stepUp.disabled = stepDown.disabled = false;
      drawStatic();
      updateMath();
    }
  }

  function resample(pts, n) {
    const dists = [0];
    for (let i = 1; i < pts.length; i++) {
      dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = dists[dists.length - 1] || 1;
    const out = [];
    for (let k = 0; k < n; k++) {
      const target = (k / n) * total;
      let i = 1;
      while (i < dists.length && dists[i] < target) i++;
      const i0 = Math.max(0, i - 1);
      const seg = (dists[i] - dists[i0]) || 1;
      const f = (target - dists[i0]) / seg;
      out.push({ x: pts[i0].x + (pts[i].x - pts[i0].x) * f, y: pts[i0].y + (pts[i].y - pts[i0].y) * f });
    }
    return out;
  }

  function computeDFT(pts) {
    const n = pts.length, out = [];
    for (let k = 0; k < n; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) {
        const phi = (2 * Math.PI * k * i) / n;
        re += pts[i].x * Math.cos(phi) + pts[i].y * Math.sin(phi);
        im += -pts[i].x * Math.sin(phi) + pts[i].y * Math.cos(phi);
      }
      out.push({ freq: k, amp: Math.hypot(re, im) / n, phase: Math.atan2(im, re) });
    }
    out.sort((a, b) => b.amp - a.amp);
    return out;
  }

  function redraw() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (points.length > 1) {
      ctx.strokeStyle = '#5b8cff';
      ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (!coeffs.length) {
      ctx.fillStyle = '#8a93ad'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('喺度用手指畫嘢…', w / 2, h / 2);
    }
  }

  // 靜態畫出「用前 terms 個向量」嘅樣（畫一圈軌跡），方便逐步睇
  function drawStatic() {
    const terms = Math.min(+slider.value, coeffs.length);
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    // 軌跡
    const path = [];
    for (let s = 0; s <= N; s++) {
      const tt = (s / N) * 2 * Math.PI;
      let x = 0, y = 0;
      for (let i = 0; i < terms; i++) {
        const c = coeffs[i], ang = c.freq * tt + c.phase;
        x += c.amp * Math.cos(ang); y += c.amp * Math.sin(ang);
      }
      path.push({ x, y });
    }
    ctx.strokeStyle = '#ff5b8c'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
    // 喺 t=0 嘅向量鏈
    let x = 0, y = 0;
    for (let i = 0; i < terms; i++) {
      const c = coeffs[i], px = x, py = y, ang = c.freq * 0 + c.phase;
      x += c.amp * Math.cos(ang); y += c.amp * Math.sin(ang);
      ctx.strokeStyle = 'rgba(138,147,173,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, c.amp, 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(54,224,192,0.85)';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    }
  }

  function drawFrame() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const terms = Math.min(+slider.value, coeffs.length);
    let x = 0, y = 0;
    for (let i = 0; i < terms; i++) {
      const c = coeffs[i], px = x, py = y, ang = c.freq * t + c.phase;
      x += c.amp * Math.cos(ang); y += c.amp * Math.sin(ang);
      ctx.strokeStyle = 'rgba(138,147,173,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, c.amp, 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(54,224,192,0.8)';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    }
    trace.unshift({ x, y });
    if (trace.length > N) trace.pop();
    ctx.strokeStyle = '#ff5b8c'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    trace.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
    t += (2 * Math.PI) / N;
    if (t > 2 * Math.PI) { t = 0; trace = []; }
  }

  function updateMath() {
    if (!coeffs.length) return;
    const terms = Math.min(+slider.value, coeffs.length);
    const newest = coeffs[terms - 1];
    mathEl.innerHTML =
      `分解成 <var>${coeffs.length}</var> 個旋轉向量，依家用緊頭 <var>${terms}</var> 個。<br>` +
      `啱啱加入嘅第 ${terms} 個：頻率 k = <var>${newest.freq}</var>，半徑 |c<sub>k</sub>| = <var>${newest.amp.toFixed(1)}</var>。`;
  }

  function play() {
    if (!coeffs.length) return;
    animating = true; t = 0; trace = [];
    cancelAnimationFrame(raf);
    const loop = () => { if (!animating) return; drawFrame(); raf = requestAnimationFrame(loop); };
    loop();
  }
  function stopAnim() { animating = false; cancelAnimationFrame(raf); }

  function clear() {
    stopAnim();
    points = []; coeffs = []; trace = [];
    playBtn.disabled = stepUp.disabled = stepDown.disabled = true;
    slider.value = 1; termsVal.textContent = 1;
    mathEl.innerHTML = '畫完一個形狀就會見到分解結果。';
    redraw();
  }

  function setTerms(n) {
    n = Math.max(1, Math.min(n, coeffs.length));
    slider.value = n; termsVal.textContent = n;
    updateMath();
    if (!animating) drawStatic();
  }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', moveDraw, { passive: false });
  canvas.addEventListener('touchend', endDraw);

  clearBtn.addEventListener('click', clear);
  playBtn.addEventListener('click', () => (animating ? (stopAnim(), drawStatic()) : play()));
  stepUp.addEventListener('click', () => { stopAnim(); setTerms(+slider.value + 1); });
  stepDown.addEventListener('click', () => { stopAnim(); setTerms(+slider.value - 1); });
  slider.addEventListener('input', () => { termsVal.textContent = slider.value; updateMath(); if (!animating) drawStatic(); });

  return { redraw };
})();

/* =================================================================
 * 4) 方波合成
 * ================================================================= */

const Wave = (() => {
  const canvas = document.getElementById('waveCanvas');
  const slider = document.getElementById('harmSlider');
  const harmVal = document.getElementById('harmVal');
  const playBtn = document.getElementById('wavePlay');
  const mathEl = document.getElementById('waveMath');

  let audioCtx, osc, gain, playing = false;

  function squareValue(x, harmonics) {
    let sum = 0;
    for (let k = 1; k <= harmonics; k += 2) sum += Math.sin(k * x) / k;
    return (4 / Math.PI) * sum;
  }

  function redraw() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const harmonics = +slider.value;
    const mid = h / 2, amp = h * 0.4, cycles = 2;

    ctx.strokeStyle = 'rgba(138,147,173,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const x = (px / w) * cycles * 2 * Math.PI;
      const y = mid - (Math.sin(x) >= 0 ? 1 : -1) * amp;
      px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
    }
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#5b8cff'); grad.addColorStop(1, '#36e0c0');
    ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const x = (px / w) * cycles * 2 * Math.PI;
      const y = mid - squareValue(x, harmonics) * amp;
      px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
    }
    ctx.stroke();

    const count = (harmonics + 1) / 2, amp_k = 4 / Math.PI / harmonics;
    mathEl.innerHTML =
      `依家疊加緊 <var>${count}</var> 個正弦波（k 去到 <var>${harmonics}</var>）。<br>` +
      `最新加入嘅 sin(<var>${harmonics}</var>x) 振幅 = (4/π)/<var>${harmonics}</var> = <var>${amp_k.toFixed(3)}</var>，越嚟越細。`;
  }

  function buildWave(ctx, harmonics) {
    const n = harmonics + 1;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k <= harmonics; k += 2) imag[k] = (4 / Math.PI) / k;
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }
  function play() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    osc = audioCtx.createOscillator();
    gain = audioCtx.createGain();
    gain.gain.value = 0.18;
    osc.setPeriodicWave(buildWave(audioCtx, +slider.value));
    osc.frequency.value = 220;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    playing = true; playBtn.textContent = '⏹ 停止';
  }
  function stop() {
    if (osc) osc.stop();
    if (audioCtx) audioCtx.close();
    osc = audioCtx = gain = null;
    playing = false; playBtn.textContent = '▶ 聽聲音';
  }

  slider.addEventListener('input', () => {
    harmVal.textContent = slider.value;
    redraw();
    if (playing && osc) osc.setPeriodicWave(buildWave(audioCtx, +slider.value));
  });
  playBtn.addEventListener('click', () => (playing ? stop() : play()));

  return { redraw };
})();

/* ----------------------------------------------------- initial paint */
window.addEventListener('resize', () => {
  const active = document.querySelector('.panel.is-active').id;
  if (active === 'panel-blocks') Blocks.redraw();
  if (active === 'panel-draw') Draw.redraw();
  if (active === 'panel-wave') Wave.redraw();
});

Blocks.redraw();
