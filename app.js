/* FFT 魔法 · Fourier Magic
 * 純前端手機 demo：聲音頻譜、畫圖旋轉向量、方波合成。
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

// 由頻率換算最接近嘅音符名 (例如 440Hz -> A4)。
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function freqToNote(freq) {
  if (!freq || freq <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return name + octave;
}

/* ----------------------------------------------------------------- tabs */

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('is-active'));
    panels.forEach(p => p.classList.remove('is-active'));
    tab.classList.add('is-active');
    const panel = document.getElementById('panel-' + tab.dataset.tab);
    panel.classList.add('is-active');
    onTabChange(tab.dataset.tab);
  });
});

function onTabChange(name) {
  if (name !== 'mic') stopMic();
  // canvas 喺隱藏時量度唔到尺寸，所以切換後重新繪畫。
  if (name === 'draw') Draw.redraw();
  if (name === 'wave') Wave.redraw();
}

/* =================================================================
 * 1) 聲音頻譜 — Web Audio AnalyserNode 即時 FFT
 * ================================================================= */

const Mic = (() => {
  const canvas = document.getElementById('micCanvas');
  const toggleBtn = document.getElementById('micToggle');
  const freqEl = document.getElementById('micFreq');
  const noteEl = document.getElementById('micNote');
  const statusEl = document.getElementById('micStatus');
  const mathEl = document.getElementById('micMath');

  let audioCtx, analyser, source, stream, bins, raf;
  let running = false;

  async function start() {
    try {
      statusEl.textContent = '正在要求麥克風權限…';
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;        // 越大頻率解析度越高
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      bins = new Uint8Array(analyser.frequencyBinCount);
      running = true;
      toggleBtn.textContent = '停止';
      statusEl.textContent = '聆聽緊… 試下吹口哨或者唱「Aaaa」';
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
    audioCtx = analyser = source = stream = null;
    toggleBtn.textContent = '開始聆聽';
    statusEl.textContent = '已停止。';
    freqEl.textContent = '—';
    noteEl.textContent = '—';
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    analyser.getByteFrequencyData(bins);

    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    // 只畫人聲/口哨相關範圍 (~0–4kHz)，視覺更聚焦。
    const sampleRate = audioCtx.sampleRate;
    const maxHz = 4000;
    const maxBin = Math.min(bins.length, Math.floor(maxHz / (sampleRate / analyser.fftSize)));

    let peakVal = 0, peakBin = 0;
    const barW = w / maxBin;
    for (let i = 0; i < maxBin; i++) {
      const v = bins[i] / 255;
      if (bins[i] > peakVal) { peakVal = bins[i]; peakBin = i; }
      const barH = v * h;
      const hue = 200 - v * 160;             // 藍 -> 黃 -> 紅
      ctx.fillStyle = `hsl(${hue}, 90%, ${30 + v * 35}%)`;
      ctx.fillRect(i * barW, h - barH, Math.max(barW - 0.5, 1), barH);
    }

    // 計算主頻率（要夠響先顯示，避免雜訊跳動）。
    const deltaF = (sampleRate / analyser.fftSize).toFixed(1);
    if (peakVal > 30) {
      const peakFreq = peakBin * sampleRate / analyser.fftSize;
      freqEl.textContent = Math.round(peakFreq);
      noteEl.textContent = freqToNote(peakFreq);
      mathEl.innerHTML =
        `採樣率 f<sub>s</sub> = <var>${sampleRate}</var> Hz，N = <var>${analyser.fftSize}</var><br>` +
        `頻率解析度 Δf = f<sub>s</sub>/N = <var>${deltaF}</var> Hz / bin<br>` +
        `主峰喺 bin <var>k = ${peakBin}</var> → <var>${Math.round(peakFreq)}</var> Hz`;
    } else {
      mathEl.innerHTML =
        `採樣率 f<sub>s</sub> = <var>${sampleRate}</var> Hz，N = <var>${analyser.fftSize}</var><br>` +
        `頻率解析度 Δf = <var>${deltaF}</var> Hz / bin　（出聲啲就會鎖定主峰）`;
    }
  }

  toggleBtn.addEventListener('click', () => (running ? stop() : start()));

  return { stop };
})();

function stopMic() { Mic.stop(); }

/* =================================================================
 * 2) 畫圖 -> 旋轉向量 (epicycles)
 *    自己寫 DFT，將觸控路徑分解成複數係數。
 * ================================================================= */

const Draw = (() => {
  const canvas = document.getElementById('drawCanvas');
  const clearBtn = document.getElementById('drawClear');
  const playBtn = document.getElementById('drawPlay');
  const slider = document.getElementById('termsSlider');
  const termsVal = document.getElementById('termsVal');
  const mathEl = document.getElementById('drawMath');

  let points = [];        // 使用者畫嘅原始點 {x,y}
  let coeffs = [];        // DFT 係數 {freq, amp, phase}
  let drawing = false;
  let animating = false;
  let t = 0, raf;
  let trace = [];

  const N = 256;          // 重採樣後嘅點數

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }

  function startDraw(e) {
    e.preventDefault();
    stopAnim();
    points = [];
    coeffs = [];
    trace = [];
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
      playBtn.disabled = false;
      updateMath();
    }
  }

  function updateMath() {
    if (!coeffs.length) return;
    const top = coeffs[0];
    const terms = Math.min(parseInt(slider.value, 10), coeffs.length);
    mathEl.innerHTML =
      `重採樣成 N = <var>${N}</var> 點，分解成 <var>${coeffs.length}</var> 個旋轉向量。<br>` +
      `最大向量：半徑 |c<sub>k</sub>| = <var>${top.amp.toFixed(1)}</var>，頻率 k = <var>${top.freq}</var>。<br>` +
      `依家用緊振幅最大嘅 <var>${terms}</var> 個向量重建。`;
  }

  // 將任意長度路徑重採樣成固定 N 點（依弧長平均分佈）。
  function resample(pts, n) {
    const dists = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      dists.push(dists[i - 1] + Math.hypot(dx, dy));
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
      out.push({
        x: pts[i0].x + (pts[i].x - pts[i0].x) * f,
        y: pts[i0].y + (pts[i].y - pts[i0].y) * f,
      });
    }
    return out;
  }

  // 離散傅立葉變換：將 (x + iy) 序列分解成旋轉向量。
  function computeDFT(pts) {
    const n = pts.length;
    const out = [];
    for (let k = 0; k < n; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) {
        const phi = (2 * Math.PI * k * i) / n;
        re += pts[i].x * Math.cos(phi) + pts[i].y * Math.sin(phi);
        im += -pts[i].x * Math.sin(phi) + pts[i].y * Math.cos(phi);
      }
      re /= n; im /= n;
      out.push({
        freq: k,
        amp: Math.hypot(re, im),
        phase: Math.atan2(im, re),
      });
    }
    // 按振幅排序：最重要嘅向量行先。
    out.sort((a, b) => b.amp - a.amp);
    return out;
  }

  function redraw() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    if (!animating && points.length > 1) {
      ctx.strokeStyle = '#5b8cff';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    if (!points.length && !animating) {
      ctx.fillStyle = '#8a93ad';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('喺度用手指畫嘢…', w / 2, h / 2);
    }
  }

  function drawFrame() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const terms = Math.min(parseInt(slider.value, 10), coeffs.length);
    let x = 0, y = 0;

    // 一個一個畫旋轉圓圈，由中心向外接力。
    for (let i = 0; i < terms; i++) {
      const c = coeffs[i];
      const px = x, py = y;
      const ang = c.freq * t + c.phase;
      x += c.amp * Math.cos(ang);
      y += c.amp * Math.sin(ang);

      ctx.strokeStyle = 'rgba(138,147,173,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, c.amp, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(54,224,192,0.8)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    trace.unshift({ x, y });
    if (trace.length > N) trace.pop();

    ctx.strokeStyle = '#ff5b8c';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    trace.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();

    t += (2 * Math.PI) / N;
    if (t > 2 * Math.PI) { t = 0; trace = []; }
  }

  function play() {
    if (!coeffs.length) return;
    animating = true;
    t = 0;
    trace = [];
    cancelAnimationFrame(raf);
    const loop = () => {
      if (!animating) return;
      drawFrame();
      raf = requestAnimationFrame(loop);
    };
    loop();
  }

  function stopAnim() {
    animating = false;
    cancelAnimationFrame(raf);
  }

  function clear() {
    stopAnim();
    points = []; coeffs = []; trace = [];
    playBtn.disabled = true;
    redraw();
  }

  // 事件
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', moveDraw, { passive: false });
  canvas.addEventListener('touchend', endDraw);

  clearBtn.addEventListener('click', clear);
  playBtn.addEventListener('click', () => (animating ? (stopAnim(), redraw()) : play()));
  slider.addEventListener('input', () => { termsVal.textContent = slider.value; updateMath(); });

  return { redraw };
})();

/* =================================================================
 * 3) 方波合成 — 用諧波砌方波，可視 + 可聽
 * ================================================================= */

const Wave = (() => {
  const canvas = document.getElementById('waveCanvas');
  const slider = document.getElementById('harmSlider');
  const harmVal = document.getElementById('harmVal');
  const playBtn = document.getElementById('wavePlay');
  const mathEl = document.getElementById('waveMath');

  let audioCtx, osc, gain, playing = false;

  // 方波 = (4/π) Σ sin((2k-1)x)/(2k-1)，只用奇次諧波。
  function squareValue(x, harmonics) {
    let sum = 0;
    for (let k = 1; k <= harmonics; k += 2) sum += Math.sin(k * x) / k;
    return (4 / Math.PI) * sum;
  }

  function redraw() {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const harmonics = parseInt(slider.value, 10);
    const mid = h / 2, amp = h * 0.4, cycles = 2;

    // 參考方波（淡色）
    ctx.strokeStyle = 'rgba(138,147,173,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const x = (px / w) * cycles * 2 * Math.PI;
      const ideal = Math.sin(x) >= 0 ? 1 : -1;
      const y = mid - ideal * amp;
      px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
    }
    ctx.stroke();

    // 合成波（亮色）
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#5b8cff');
    grad.addColorStop(1, '#36e0c0');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const x = (px / w) * cycles * 2 * Math.PI;
      const y = mid - squareValue(x, harmonics) * amp;
      px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
    }
    ctx.stroke();

    const count = (harmonics + 1) / 2;            // 1..harmonics 之間嘅奇數個數
    const amp_k = (4 / Math.PI / harmonics);
    mathEl.innerHTML =
      `依家疊加緊 <var>${count}</var> 個正弦波（k 去到 <var>${harmonics}</var>）。<br>` +
      `最新加入嘅 sin(<var>${harmonics}</var>x) 振幅 = (4/π)/<var>${harmonics}</var> = <var>${amp_k.toFixed(3)}</var>，` +
      `已經好細，所以對波形影響越來越微。`;
  }

  // 用 PeriodicWave 由諧波直接砌聲，同畫面一致。
  function buildWave(ctx, harmonics) {
    const n = harmonics + 1;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k <= harmonics; k += 2) imag[k] = (4 / Math.PI) / k;
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  function play() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    osc = audioCtx.createOscillator();
    gain = audioCtx.createGain();
    gain.gain.value = 0.18;
    osc.setPeriodicWave(buildWave(audioCtx, parseInt(slider.value, 10)));
    osc.frequency.value = 220;            // A3，柔和耐聽
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
    playBtn.textContent = '▶ 聽聲音';
  }

  slider.addEventListener('input', () => {
    harmVal.textContent = slider.value;
    redraw();
    if (playing && osc) osc.setPeriodicWave(buildWave(audioCtx, parseInt(slider.value, 10)));
  });
  playBtn.addEventListener('click', () => (playing ? stop() : play()));

  return { redraw };
})();

/* ----------------------------------------------------- initial paint */
window.addEventListener('resize', () => {
  if (document.getElementById('panel-draw').classList.contains('is-active')) Draw.redraw();
  if (document.getElementById('panel-wave').classList.contains('is-active')) Wave.redraw();
});

// 首屏：mic 面板顯示，但畫圖/波形要等切換時先畫（避免量度到 0 尺寸）。
Draw.redraw();
