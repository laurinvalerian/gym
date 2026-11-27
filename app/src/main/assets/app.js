'use strict';
/* GymLog: Körpergewicht + Training. Alle Daten lokal und dauerhaft gespeichert. */

// ================= Speicher =================
const NATIVE = typeof window.Android !== 'undefined';
const KEY = 'gymlog';
const DEFAULTS = () => ({
  v: 3,
  weights: [],     // {d:'YYYY-MM-DD', kg}
  exercises: [],   // {id, name, mode:'reps'|'time', load:'weight'|'bw'|'bwplus', note}
  plans: [],       // {id, name, items:[{id, exId, sets:[{t:'w'|'n', goal:'8-10', rest:120}]}]}
  workouts: [],    // {id, planId, name, start, end, deload, items:[{exId, note, sets:[{t:'w'|'n', kg, reps, rir}]}]}
  active: null,
  settings: {
    rest: 120, warmRest: 60, step: 2.5, vibrate: true, sound: true, keepAwake: true, rir: true,
    deloadOn: false, deloadRemind: true, deloadDismissed: null,
    deload: { weightPct: 10, repsPct: 0, setsPct: 50 },
    cycle: { start: null, reentry: 4, block: 7, firstBlock: 10, deloadStart: null }
  }
});

let S;
function merge(def, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj === undefined ? def : obj;
  const out = { ...def };
  for (const k in obj) out[k] = (def && def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) ? merge(def[k], obj[k]) : obj[k];
  return out;
}
function migrate(d) {
  if (!d) return d;
  if ((d.v || 1) < 2) migrate1(d);
  if (d.v < 3) {
    // Plan-Übungen: einzelne Sätze mit eigener Pause
    (d.plans || []).forEach(p => p.items.forEach(it => {
      if (Array.isArray(it.sets)) return;
      const sets = [];
      for (let i = 0; i < (it.warm || 0); i++) sets.push({ t: 'w', goal: it.target || '8-10', rest: it.warmRest || 0 });
      for (let i = 0; i < (it.sets || 1); i++) sets.push({ t: 'n', goal: it.target || '8-10', rest: it.rest ?? 120 });
      it.sets = sets; delete it.warm; delete it.target; delete it.rest; delete it.warmRest;
    }));
    d.v = 3;
  }
  return d;
}
function migrate1(d) {
  const st = d.settings || {};
  const oldWarmOn = st.warmRest !== false, oldWarmSec = st.warmRestSec ?? 60;
  st.warmRest = oldWarmOn ? oldWarmSec : 0; delete st.warmRestSec;
  // Deload-Plan fest: versehentliches Ein/Aus rückgängig machen
  if (st.cycle) { delete st.cycle.count; delete st.cycle.lastDeloadEnd; st.cycle.deloadStart = null; }
  st.deloadOn = false; delete st.deloadFix;
  d.settings = st;
  (d.exercises || []).forEach(e => { e.mode = e.mode || 'reps'; e.load = e.load || 'weight'; });
  const conv = it => { if (it.target == null) it.target = it.reps ?? '8-10'; if (typeof it.warmRest === 'boolean' || it.warmRestSec != null) it.warmRest = it.warmRest === false ? 0 : (it.warmRestSec ?? 60); delete it.reps; delete it.warmRestSec; };
  (d.plans || []).forEach(p => p.items.forEach(conv));
  if (d.active) { d.active.deload = false; d.active.items.forEach(conv); }
  d.v = 2;
}
function load() {
  let raw = '';
  try { raw = NATIVE ? Android.load() : localStorage.getItem(KEY); } catch (e) {}
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (e) {}
  const was = data && data.v;
  S = merge(DEFAULTS(), migrate(data) || {});
  if (data && was !== S.v) saveNow();
}
let saveT = null;
function saveNow() {
  clearTimeout(saveT); saveT = null;
  const txt = JSON.stringify(S);
  try { if (NATIVE) Android.save(txt); else localStorage.setItem(KEY, txt); } catch (e) { toast('Speichern fehlgeschlagen!'); }
}
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) saveNow(); });
window.addEventListener('pagehide', () => { if (saveT) saveNow(); });

// ================= Helfer =================
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pdate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const DAY = 864e5;
const num = v => (v === '' || v == null) ? NaN : parseFloat(String(v).replace(',', '.'));
const fmt = (v, dec = 1) => isFinite(v) ? Number(v).toLocaleString('de-DE', { maximumFractionDigits: dec }) : '';
const fmtF = (v, dec = 1) => isFinite(v) ? Number(v).toLocaleString('de-DE', { maximumFractionDigits: dec, minimumFractionDigits: dec }) : '';
const roundStep = (v, step) => Math.round(v / step) * step;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const fdate = (k, wd = true) => { const d = typeof k === 'string' ? pdate(k) : new Date(k); return (wd ? WD[d.getDay()] + ', ' : '') + d.getDate() + '. ' + MON[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
function monday(k) { const d = pdate(k); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dkey(d); }
function isoWeek(k) { const d = pdate(k); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const y = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - y) / DAY - 3 + (y.getDay() + 6) % 7) / 7); }
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
function range(r) { const n = String(r || '').match(/\d+/g); if (!n) return [8, 8]; return [+n[0], +n[n.length - 1]]; }
const e1rm = (kg, reps) => reps > 0 && kg > 0 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : 0;

// Übungen
const EX0 = { id: '', name: 'Übung', mode: 'reps', load: 'weight', note: '' };
const exOf = id => S.exercises.find(e => e.id === id) || EX0;
const exName = id => exOf(id).name;
const isTime = ex => ex.mode === 'time';
const hasKg = ex => ex.load !== 'bw';
const valUnit = ex => isTime(ex) ? 'Sek.' : 'Wdh.';
const kgHead = ex => ex.load === 'bwplus' ? '+kg' : 'kg';
const LOAD_L = { weight: 'Gewicht', bw: 'Körpergewicht', bwplus: 'Körper + Gewicht' };
const exTags = ex => `${isTime(ex) ? 'Zeit' : 'Wdh.'} · ${LOAD_L[ex.load]}`;
/** Körpergewicht an einem Datum (letzter Eintrag davor, sonst der nächste) */
function bwAt(ts) {
  if (!S.weights.length) return 0;
  const k = dkey(new Date(ts)); let best = null;
  for (const w of S.weights) if (w.d <= k && (!best || w.d > best.d)) best = w;
  if (!best) best = S.weights.reduce((a, b) => a.d < b.d ? a : b);
  return best.kg;
}
const effKg = (ex, s, ts) => ex.load === 'weight' ? (s.kg || 0) : ex.load === 'bw' ? bwAt(ts) : bwAt(ts) + (s.kg || 0);
function setTxt(ex, s) {
  const r = s.rir !== '' && s.rir != null ? ' @' + s.rir : '';
  const v = isTime(ex) ? s.reps + ' s' : s.reps;
  if (ex.load === 'bw') return (isTime(ex) ? v : v + ' Wdh.') + r;
  const k = ex.load === 'bwplus' ? '+' + (fmt(num(s.kg)) || 0) : (fmt(num(s.kg)) || 0);
  return k + (isTime(ex) ? ' kg · ' : '×') + v + r;
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2400); }
function vib(ms = 300) { if (!S.settings.vibrate) return; try { if (NATIVE) Android.vibrate(ms); else navigator.vibrate && navigator.vibrate([ms, 150, ms]); } catch (e) {} }
let actx;
function beep() {
  if (!S.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    [0, .25, .5].forEach((t, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = i === 2 ? 1320 : 880; o.connect(g); g.connect(actx.destination);
      const st = actx.currentTime + t; g.gain.setValueAtTime(.0001, st); g.gain.exponentialRampToValueAtTime(.4, st + .02); g.gain.exponentialRampToValueAtTime(.0001, st + .2);
      o.start(st); o.stop(st + .22);
    });
  } catch (e) {}
}
document.addEventListener('pointerdown', () => { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }, { passive: true });

// ================= Icons =================
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  scale: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 10a4 4 0 0 1 8 0"/><path d="M12 10l1.5-2"/>'),
  dumb: svg('<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>'),
  chart: svg('<path d="M4 4v16h16"/><path d="M8 15l3.5-4 3 3L19 8"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  chev: svg('<path d="M9 6l6 6-6 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>')
};

// ================= Navigation =================
let tab = 'weight';
let stack = []; // Unteransichten: {v, id}
const ui = { wRange: '3M', trainSeg: 'plans', histSeg: 'workouts', exMetric: null };
const topView = () => stack[stack.length - 1];
function go(v, id) { stack.push({ v, id }); render(true); }
function back() {
  if (!$('#modal').classList.contains('hidden')) { closeModal(); return true; }
  if (stack.length) { stack.pop(); render(true); return true; }
  if (tab !== 'training') { tab = 'training'; render(true); return true; }
  return false;
}
window.onBack = back;

function render(resetScroll) {
  if (kpT) kpClose();
  const view = $('#view'), sc = view.scrollTop, t = topView();
  let r;
  if (t && t.v === 'plan') r = viewPlanEdit(t.id);
  else if (t && t.v === 'session') r = viewSession();
  else if (t && t.v === 'workout') r = viewWorkoutDetail(t.id);
  else if (t && t.v === 'exercise') r = viewExercise(t.id);
  else if (t && t.v === 'weights') r = viewWeightList();
  else if (t && t.v === 'deloadinfo') r = viewDeloadInfo();
  else r = { weight: viewWeight, training: viewTraining, history: viewHistory, settings: viewSettings }[tab]();
  const [title, body, right] = r;
  $('#top').innerHTML = (stack.length ? `<button class="iconbtn ghost back" data-a="back" aria-label="Zurück">${IC.back}</button>` : '') + `<h1>${esc(title)}</h1>` + (right || '');
  $('#top').classList.toggle('sub', !!stack.length);
  view.innerHTML = body;
  view.scrollTop = resetScroll ? 0 : sc;
  const inSession = t && t.v === 'session';
  $('#nav').classList.toggle('hidden', !!inSession);
  $('#nav').innerHTML = [['weight', 'Gewicht', IC.scale], ['training', 'Training', IC.dumb], ['history', 'Verlauf', IC.chart], ['settings', 'Mehr', IC.cog]]
    .map(([k, l, i]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-id="${k}">${i}<span>${l}</span></button>`).join('');
  view.querySelectorAll('.chart[data-chart]').forEach(drawChartInto);
  renderTimer();
  if (pendingReload) setTimeout(maybeReload, 300);
}

// ================= Bausteine =================
const stepper = (a, id, val, extra = '') => `<div class="stepper"><button data-a="${a}" data-id="${id}" data-s="-1" ${extra}>−</button><span>${val}</span><button data-a="${a}" data-id="${id}" data-s="1" ${extra}>+</button></div>`;
const toggle = (a, id, on) => `<label class="switch"><input type="checkbox" data-a="${a}" data-id="${id}" ${on ? 'checked' : ''}><span></span></label>`;
const rowItem = (label, ctrl, sub = '') => `<div class="ri"><div class="ri-l">${label}${sub ? `<small>${sub}</small>` : ''}</div><div class="ri-c">${ctrl}</div></div>`;
const seg = (a, opts, cur, id = '') => `<div class="seg">${opts.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-a="${a}" data-id="${id}" data-v="${k}">${l}</button>`).join('')}</div>`;
const empty = (t, s = '') => `<div class="empty"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div>`;

// ================= Charts =================
const charts = {};
function chartBox(id, cfg) { charts[id] = cfg; return `<div class="chart" data-chart="${id}"></div>`; }
function drawChartInto(el) {
  const cfg = charts[el.dataset.chart]; if (!cfg) return;
  const W = el.clientWidth || 340, H = cfg.h || 190, pl = 38, pr = 8, pt = 12, pb = 22;
  const all = cfg.series.flatMap(s => s.pts);
  if (!all.length) { el.innerHTML = '<div class="empty small"><span>Noch keine Daten</span></div>'; return; }
  let x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
  if (x1 - x0 < DAY) { x0 -= DAY * 3; x1 += DAY * 3; }
  let y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
  const padY = Math.max((y1 - y0) * 0.15, cfg.minPad || 0.5); y0 -= padY; y1 += padY;
  const X = x => pl + (x - x0) / (x1 - x0) * (W - pl - pr);
  const Y = y => pt + (1 - (y - y0) / (y1 - y0)) * (H - pt - pb);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = y0 + (y1 - y0) * i / 4, yy = Y(v);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/><text x="${pl - 6}" y="${yy + 3.5}" fill="var(--mut)" font-size="10" text-anchor="end">${fmt(v, (y1 - y0) < 10 ? 1 : 0)}</text>`;
  }
  const span = x1 - x0, nx = Math.min(4, Math.max(2, Math.floor(W / 90)));
  for (let i = 0; i <= nx; i++) {
    const x = x0 + span * i / nx, d = new Date(x);
    const lab = span > 400 * DAY ? MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) : d.getDate() + '. ' + MON[d.getMonth()];
    g += `<text x="${X(x)}" y="${H - 5}" fill="var(--mut)" font-size="10" text-anchor="${i === 0 ? 'start' : i === nx ? 'end' : 'middle'}">${lab}</text>`;
  }
  cfg.series.forEach(s => {
    const pts = s.pts.slice().sort((a, b) => a.x - b.x);
    if (s.line && pts.length > 1) g += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2.5}" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')}"/>`;
    if (s.dots) pts.forEach(p => { g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${s.r || 3}" fill="${p.hollow ? 'var(--bg)' : s.color}" stroke="${s.color}" stroke-width="${p.hollow ? 1.5 : 0}" opacity="${s.op || 1}"/>`; });
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}">${g}<line class="cur" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="var(--text)" stroke-width="1" opacity="0"/><circle class="curp" r="5" fill="var(--text)" opacity="0"/></svg><div class="tip hidden"></div>`;
  const main = cfg.series[cfg.tipSeries || 0].pts.slice().sort((a, b) => a.x - b.x);
  const sv = el.querySelector('svg'), tip = el.querySelector('.tip'), cur = el.querySelector('.cur'), curp = el.querySelector('.curp');
  const show = ev => {
    if (!main.length) return;
    const r = sv.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
    let best = main[0]; for (const p of main) if (Math.abs(X(p.x) - px) < Math.abs(X(best.x) - px)) best = p;
    const cx = X(best.x), cy = Y(best.y);
    cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); cur.setAttribute('opacity', .25);
    curp.setAttribute('cx', cx); curp.setAttribute('cy', cy); curp.setAttribute('opacity', 1);
    tip.classList.remove('hidden'); tip.innerHTML = best.label || fmt(best.y);
    tip.style.left = Math.min(Math.max(cx / W * r.width, 70), r.width - 70) + 'px';
  };
  sv.addEventListener('pointerdown', show); sv.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') show(e); });
}

// ================= Körpergewicht =================
const weightsSorted = () => S.weights.slice().sort((a, b) => a.d < b.d ? -1 : 1);
function weeklyAvgs() {
  const m = {};
  for (const w of S.weights) { const k = monday(w.d); (m[k] = m[k] || []).push(w.kg); }
  return Object.keys(m).sort().map(k => ({ wk: k, avg: m[k].reduce((a, b) => a + b, 0) / m[k].length, n: m[k].length }));
}
const delta = (d, dec = 1) => isFinite(d) ? `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${fmtF(d, dec)}</span>` : '<span class="mut">–</span>';
function viewWeight() {
  const today = dkey(), ws = weightsSorted();
  const todayW = S.weights.find(w => w.d === today), last = ws[ws.length - 1];
  const pre = todayW ? todayW.kg : (last ? last.kg : 75);
  const weeks = weeklyAvgs(), cur = weeks[weeks.length - 1], prev = weeks[weeks.length - 2];
  let h = `<div class="card hero">
    <div class="hero-top"><span>${todayW ? 'Heute' : fdate(today)}</span>${todayW ? '<span class="pill a">Gespeichert</span>' : ''}</div>
    <div class="wentry">
      <button class="round" data-a="wstep" data-id="-0.1">−</button>
      <div class="wval"><input id="wIn" inputmode="none" data-kp="dec" data-step="0.1" value="${fmtF(pre)}"><span>kg</span></div>
      <button class="round" data-a="wstep" data-id="0.1">+</button>
    </div>
    <button class="btn pri block" data-a="wsave">${todayW ? 'Aktualisieren' : 'Speichern'}</button>
  </div>` + backupBanner();
  if (cur) {
    const d = prev ? cur.avg - prev.avg : NaN;
    let trend = '';
    if (weeks.length >= 3) {
      const n = Math.min(5, weeks.length), a = weeks[weeks.length - n];
      const per = (cur.avg - a.avg) / ((pdate(cur.wk) - pdate(a.wk)) / (7 * DAY));
      trend = `<div class="stat"><small>Trend</small><b>${delta(per, 2)}</b><small>kg pro Woche</small></div>`;
    }
    h += `<div class="stats">
      <div class="stat"><small>${cur.wk === monday(today) ? 'Diese Woche' : 'KW ' + isoWeek(cur.wk)} Ø</small><b>${fmtF(cur.avg)}</b><small>${plural(cur.n, 'Messung', 'Messungen')}</small></div>
      <div class="stat"><small>vs. Vorwoche</small><b>${delta(d)}</b><small>${prev ? 'Ø ' + fmtF(prev.avg) : 'keine Daten'}</small></div>${trend}</div>`;
  }
  const ranges = { '1M': 31, '3M': 92, '6M': 183, '1J': 366, 'Alle': 1e6 };
  const minX = Date.now() - ranges[ui.wRange] * DAY;
  const daily = ws.filter(w => pdate(w.d) >= minX).map(w => ({ x: +pdate(w.d), y: w.kg, label: `${fdate(w.d)} · <b>${fmtF(w.kg)} kg</b>` }));
  const wk = weeks.filter(w => +pdate(w.wk) + 6 * DAY >= minX).map(w => ({ x: +pdate(w.wk) + 3 * DAY, y: w.avg, label: `KW ${isoWeek(w.wk)} · Ø <b>${fmtF(w.avg)} kg</b>` }));
  h += `<div class="sec">Verlauf</div><div class="card">
    ${seg('wrange', Object.keys(ranges).map(k => [k, k]), ui.wRange)}
    ${chartBox('w', { h: 200, tipSeries: 1, series: [{ pts: daily, color: 'var(--blue)', dots: true, r: 2.5, op: .5 }, { pts: wk, color: 'var(--acc)', line: true, dots: true, r: 3.5 }] })}
    <div class="legend"><span><i style="background:var(--blue)"></i>Tageswerte</span><span><i style="background:var(--acc)"></i>Wochenschnitt</span></div>
  </div>`;
  h += `<div class="sec">Wochenschnitte</div><div class="card list">`;
  if (!weeks.length) h += empty('Noch keine Einträge', 'Am besten jeden Morgen nach dem Aufstehen wiegen.');
  weeks.slice().reverse().slice(0, 12).forEach((w, i) => {
    const p = weeks[weeks.length - 2 - i];
    h += `<div class="li"><div class="li-m"><b>KW ${isoWeek(w.wk)}</b><small>${fdate(w.wk, false)} · ${w.n}×</small></div><div class="li-r"><b>${fmtF(w.avg)} kg</b><small>${p ? delta(w.avg - p.avg) : ''}</small></div></div>`;
  });
  h += `</div><div class="two"><button class="btn" data-a="wlist">Alle Einträge</button><button class="btn" data-a="wadd">Nachtragen</button></div>`;
  return ['Gewicht', h];
}
function viewWeightList() {
  const ws = weightsSorted().reverse();
  let h = '<div class="card list">';
  if (!ws.length) h += empty('Keine Einträge');
  ws.forEach(w => { h += `<div class="li tap" data-a="wedit" data-id="${w.d}"><div class="li-m"><b>${fdate(w.d)}</b></div><div class="li-r"><b>${fmtF(w.kg)} kg</b></div><span class="chev">${IC.chev}</span></div>`; });
  return ['Alle Einträge', h + '</div>'];
}
function weightDialog(d) {
  const ex = S.weights.find(w => w.d === d);
  modal(`<h3>${ex ? 'Eintrag bearbeiten' : 'Gewicht nachtragen'}</h3>
    <label class="lbl">Datum</label><input class="f" type="date" id="mD" value="${d || dkey()}" max="${dkey()}">
    <label class="lbl">Gewicht (kg)</label><input class="f" id="mK" inputmode="none" data-kp="dec" value="${ex ? fmtF(ex.kg) : ''}">`,
    [ex ? { l: 'Löschen', c: 'danger', f: () => { S.weights = S.weights.filter(w => w.d !== d); saveNow(); render(); } } : { l: 'Abbrechen' },
     { l: 'Speichern', c: 'pri', f: () => {
       const nd = $('#mD').value, kg = num($('#mK').value);
       if (!nd || !(kg > 20 && kg < 400)) { toast('Bitte gültiges Gewicht eingeben'); return false; }
       S.weights = S.weights.filter(w => w.d !== nd && w.d !== d); S.weights.push({ d: nd, kg: Math.round(kg * 100) / 100 }); saveNow(); render();
     } }]);
}

// ================= Wochen & Deload =================
/* Programm: Woche 1–4 Wiedereinstieg, danach Blöcke à 7 Wochen, Woche 7 ist Deload (GL.weekInfo).
   In der Deload-Woche wird automatisch leichter gerechnet, außer du wählst „Fühl mich gut“.
   Der Schalter startet zusätzlich einen Deload außer der Reihe (7 Tage). */
function weekNow() { const c = S.settings.cycle; return GL.weekInfo(c, dkey()) || GL.weekInfo(Object.assign({}, c, { start: dkey() }), dkey()); }
const weekStarted = () => !!S.settings.cycle.start;
function deloadNow() { const i = weekNow(); return S.settings.deloadOn || (weekStarted() && i.isDeload && S.settings.deloadDismissed !== monday(dkey())); }
const REENTRY_TXT = { 1: '2 Arbeitssätze pro Übung, RIR 3, Top-Set-Übungen nur 3×5 leicht', 2: 'Normale Sätze, RIR 2–3, Top-Set-Übungen weiter 3×5', 3: 'RIR 2, Top Sets erlaubt', 4: 'Normal trainieren' };
function phaseText(i, dl) {
  if (dl) return 'Deload: Sätze halbiert, −10 % Gewicht, RIR 3–4, kein Top Set';
  if (i.phase === 'reentry') return `Wiedereinstieg ${i.reW}/${S.settings.cycle.reentry}: ${REENTRY_TXT[i.reW] || 'Normal trainieren'}`;
  return `Block-Woche ${i.blockWeek}/${S.settings.cycle.block} · Deload in ${plural(i.dueIn, 'Woche', 'Wochen')}`;
}
function setDeload(on) {
  S.settings.deloadOn = on;
  S.settings.cycle.deloadStart = on ? dkey() : null;
  if (S.active && !S.active.items.some(i => i.sets.some(s => s.done))) applyDeloadToActive(on);
  saveNow(); render();
}
function askDeload() {
  modal(`<h3>Deload starten?</h3><p class="info">7 Tage lang rechnet die App deine Trainings leichter: <b>Sätze halbiert</b>, <b>−${S.settings.deload.weightPct}% Gewicht</b>, RIR 3–4, kein Top Set. Danach schaltet er sich von selbst aus. Dein Wochenplan verschiebt sich dadurch nicht.</p>`,
    [{ l: 'Abbrechen' }, { l: 'Deload starten', c: 'warnb', f: () => setDeload(true) }]);
}
function deloadAutoOff() {
  const c = S.settings.cycle;
  if (S.settings.deloadOn && c.deloadStart && (pdate(dkey()) - pdate(c.deloadStart)) / DAY >= 7) { S.settings.deloadOn = false; c.deloadStart = null; saveNow(); return true; }
  return false;
}
/** Push am Montag der nächsten Deload-Woche, 8 Uhr */
function syncReminder() {
  if (!NATIVE || !Android.scheduleReminder) return;
  try {
    const c = S.settings.cycle, i = weekStarted() && GL.weekInfo(c, dkey());
    if (!S.settings.deloadRemind || !i) { Android.cancelReminder(); return; }
    const at = pdate(GL.weekStart(c, i.isDeload ? i.week + c.block : i.nextDeloadWeek)); at.setHours(8, 0, 0, 0);
    Android.scheduleReminder(+at);
  } catch (e) {}
}
function deloadReminder() {
  const st = S.settings, i = weekNow();
  if (!st.deloadRemind || !weekStarted() || !i.isDeload || st.deloadDismissed === monday(dkey()) || st.deloadAck === monday(dkey())) return '';
  return `<div class="notice warn"><b>Hey, Deload-Woche 💪 Wie fühlst du dich?</b>
    <p>Diese Woche rechnet die App automatisch leichter: Sätze halbiert, −10 % Gewicht, RIR 3–4, kein Top Set. Fühlst du dich richtig gut, kannst du ihn diesmal auslassen.</p>
    <div class="two"><button class="btn warnb" data-a="deloadyes">Deload machen</button><button class="btn" data-a="deloadno">Fühl mich gut</button></div></div>`;
}
function deloadCard() {
  const st = S.settings, i = weekNow(), dl = deloadNow();
  let txt, bar = '';
  if (st.deloadOn) {
    const days = st.cycle.deloadStart ? Math.floor((pdate(dkey()) - pdate(st.cycle.deloadStart)) / DAY) : 0;
    txt = `<b class="warn">Deload aktiv · Tag ${days + 1} von 7</b><small>${phaseText(i, true)}</small>`;
  } else if (!weekStarted()) {
    txt = `<b>Programm</b><small>Startet mit deinem ersten Training: ${st.cycle.reentry} Wochen Wiedereinstieg, dann Blöcke à ${st.cycle.block} Wochen mit Deload in Woche ${st.cycle.block}.</small>`;
  } else {
    txt = `<b class="${dl ? 'warn' : ''}">Woche ${i.week}${dl ? ' · Deload' : i.phase === 'reentry' ? ' · Wiedereinstieg' : ''}</b><small>${phaseText(i, dl)}</small>`;
    const pos = i.phase === 'reentry' ? i.reW / st.cycle.reentry : i.blockWeek / st.cycle.block;
    bar = `<div class="bar"><i style="width:${Math.min(100, pos * 100)}%;${dl ? 'background:var(--warn)' : i.phase === 'reentry' ? 'background:var(--blue)' : ''}"></i></div>`;
  }
  return `<div class="card deload ${st.deloadOn ? 'on' : ''}"><div class="ri" style="padding:0"><div class="ri-l tap" data-a="deloadinfo">${txt}</div><div class="ri-c"><label class="switch w"><input type="checkbox" data-a="deload" ${st.deloadOn ? 'checked' : ''}><span></span></label></div></div>${bar}</div>`;
}
function viewDeloadInfo() {
  const d = S.settings.deload, c = S.settings.cycle;
  const h = `<div class="card"><h3>So rechnet die App</h3>
    <p class="info"><b>Woche 1–${c.reentry} Wiedereinstieg:</b> W1 2 Arbeitssätze, RIR 3, Top-Set-Übungen nur 3×5 leicht · W2 normale Sätze, RIR 2–3, weiter 3×5 · W3 RIR 2, Top Sets erlaubt · W4 normal.</p>
    <p class="info"><b>Danach Blöcke à ${c.block} Wochen</b>, Woche ${c.block} ist Deload: Sätze halbiert (aufgerundet), −${d.weightPct}% Gewicht, RIR 3–4, kein Top Set. Deload-Trainings zählen nicht für die Progression.</p>
    <p class="info"><b>Progression:</b> Top Set oberes Ende erreicht → nächstes Mal + Schrittweite der Übung. Alle anderen Sätze: erst wenn alle Arbeitssätze oben sind. Zweimal hintereinander unteres Ende verpasst → Vorschlag −10 %. Back-off = Top Set × Faktor. Aufwärmen in % vom Top Set bzw. Arbeitsgewicht, auf 2,5 kg gerundet, Langhantel mind. 20 kg.</p>
    <p class="info">Der Schalter startet zusätzlich einen Deload außer der Reihe (7 Tage), der Wochenplan verschiebt sich nicht.</p></div>
  <div class="sec">Einstellungen</div>
  <div class="card list">
    ${rowItem('Wiedereinstieg', stepper('dset', 'cycle.reentry', c.reentry + ' Wo.'))}
    ${rowItem('Blocklänge (inkl. Deload)', stepper('dset', 'cycle.block', c.block + ' Wo.'))}
    ${rowItem('Deload: weniger Gewicht', stepper('dset', 'deload.weightPct', d.weightPct + '%'))}
    ${rowItem('Erinnerung', toggle('remindset', '', S.settings.deloadRemind), 'In der App und als Push')}
    ${rowItem('Programmstart (Woche 1)', `<input class="f sm" type="date" data-a="cyclestart" value="${c.start || ''}">`)}
  </div>`;
  return ['Programm & Deload', h];
}
const DSET = { 'cycle.reentry': [1, 0, 8], 'cycle.block': [1, 3, 12], 'deload.weightPct': [5, 0, 30] };

// ================= Übungen =================
const MUSCLES = ['Brust', 'Schulter vorne', 'Schulter seitlich', 'Schulter hinten', 'Trizeps', 'Rücken', 'Bizeps', 'Unterarme', 'Trapez', 'Nacken', 'Quads', 'Beinbeuger', 'Po', 'Waden', 'Bauch'];
const STEPS = [1, 1.25, 2, 2.5, 5];
const exStep = ex => ex.step || S.settings.step;
function exerciseEditor(id, onSave) {
  const e = id ? S.exercises.find(x => x.id === id) : null;
  const dr = e ? { ...e, muscles: { ...(e.muscles || {}) } } : { name: '', mode: 'reps', load: 'weight', note: '', step: S.settings.step, barbell: false, perLeg: false, muscles: {} };
  const draw = () => {
    const hint = { weight: 'z.B. Bankdrücken, Kurzhantel, Maschine', bw: 'z.B. Liegestütze, Plank', bwplus: 'z.B. Klimmzüge oder Dips mit Zusatzgewicht' }[dr.load];
    const mchip = m => { const v = dr.muscles[m] || 0; return `<button class="chip ${v === 1 ? 'on' : v ? 'half' : ''}" data-a="exmus" data-v="${m}">${m}${v ? ' ' + fmt(v, 1) : ''}</button>`; };
    modal(`<h3>${e ? 'Übung bearbeiten' : 'Neue Übung'}</h3>
      <label class="lbl">Name</label><input class="f" id="mExN" value="${esc(dr.name)}" placeholder="z.B. Bankdrücken">
      <label class="lbl">Gemessen in</label>${seg('exmode', [['reps', 'Wiederholungen'], ['time', 'Zeit (Sek.)']], dr.mode)}
      <label class="lbl">Gewicht</label>${seg('exload', [['weight', 'Gewicht'], ['bw', 'Körper'], ['bwplus', 'Körper + kg']], dr.load)}
      <div class="hint">${hint}</div>
      ${dr.load !== 'bw' ? `<label class="lbl">Schrittweite für Steigerungen</label>${seg('exstep', STEPS.map(v => [String(v), fmt(v, 2) + ' kg']), String(dr.step))}` : ''}
      <div class="list">
        ${dr.load === 'weight' ? rowItem('Langhantel', `<label class="switch"><input type="checkbox" data-a="exbar" ${dr.barbell ? 'checked' : ''}><span></span></label>`, 'Aufwärmen mindestens 20 kg') : ''}
        ${rowItem('Pro Bein / pro Seite', `<label class="switch"><input type="checkbox" data-a="exleg" ${dr.perLeg ? 'checked' : ''}><span></span></label>`, 'z.B. Ausfallschritte')}
      </div>
      <label class="lbl">Muskeln (Tipp: 1 = Hauptmuskel, 0,5 = hilft mit)</label><div class="chips">${MUSCLES.map(mchip).join('')}</div>
      <label class="lbl">Notiz (optional, gilt überall)</label><input class="f" id="mExNote" value="${esc(dr.note || '')}" placeholder="z.B. Sitz Stufe 4">`,
      [e ? { l: 'Löschen', c: 'danger', f: () => { deleteExercise(e); return false; } } : { l: 'Abbrechen' },
       { l: 'Speichern', c: 'pri', f: () => {
         const name = $('#mExN').value.trim();
         if (!name) { toast('Bitte einen Namen eingeben'); return false; }
         if (S.exercises.some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== (e && e.id) && !x.archived)) { toast('Diese Übung gibt es schon'); return false; }
         let t = e;
         if (!t) { t = { id: uid() }; S.exercises.push(t); }
         Object.assign(t, { name, mode: dr.mode, load: dr.load, note: $('#mExNote').value.trim(), step: dr.step, barbell: dr.load === 'weight' && dr.barbell, perLeg: dr.perLeg, muscles: dr.muscles });
         delete t.archived;
         saveNow();
         if (onSave) onSave(t); else render();
       } }]);
  };
  exerciseEditor.set = (k, v) => {
    dr.name = $('#mExN').value; dr.note = $('#mExNote').value;
    if (k === 'muscle') { const c = dr.muscles[v] || 0; const n = c === 0 ? 1 : c === 1 ? 0.5 : 0; if (n) dr.muscles[v] = n; else delete dr.muscles[v]; }
    else dr[k] = v;
    draw();
  };
  draw();
  if (!e) setTimeout(() => $('#mExN') && $('#mExN').focus(), 60);
}
function deleteExercise(e) {
  const inHist = S.workouts.some(w => w.items.some(i => i.exId === e.id));
  const plans = S.plans.filter(p => p.items.some(i => i.exId === e.id));
  modal(`<h3>„${esc(e.name)}“ löschen?</h3><p class="info">${plans.length ? `Sie wird aus ${plural(plans.length, 'Plan', 'Plänen')} entfernt. ` : ''}${inHist ? 'Dein bisheriger Verlauf bleibt erhalten.' : ''}</p>`,
    [{ l: 'Abbrechen' }, { l: 'Löschen', c: 'danger', f: () => {
      S.plans.forEach(p => { p.items = p.items.filter(i => i.exId !== e.id); p.items.forEach(i => { if (i.alts) i.alts = i.alts.filter(a => a !== e.id); }); });
      if (inHist) e.archived = true; else S.exercises = S.exercises.filter(x => x !== e);
      saveNow(); render();
    } }]);
}
function exercisePicker(cb, title = 'Übung hinzufügen') {
  let q = '';
  const list = () => S.exercises.filter(e => !e.archived && e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const items = () => list().map(e => `<div class="li tap" data-a="pickex" data-id="${e.id}"><div class="li-m"><b>${esc(e.name)}</b><small>${exTags(e)}</small></div><span class="chev">${IC.plus}</span></div>`).join('') || `<div class="empty small"><span>Nichts gefunden</span></div>`;
  const has = S.exercises.some(e => !e.archived);
  modal(`<h3>${title}</h3>
    <button class="btn pri block" data-a="pickexnew">+ Neue Übung erstellen</button>
    ${has ? `<input class="f" id="mExQ" placeholder="Meine Übungen durchsuchen" style="margin-top:12px"><div class="list" id="mExL">${items()}</div>` : '<div class="hint">Du hast noch keine Übungen. Erstell deine erste, danach kannst du sie in jedem Plan wiederverwenden.</div>'}`, [{ l: 'Schließen' }]);
  exercisePicker.cb = cb;
  const qi = $('#mExQ'); if (qi) qi.addEventListener('input', () => { q = qi.value; $('#mExL').innerHTML = items(); });
}
function viewExerciseList() {
  const ex = S.exercises.filter(e => !e.archived).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  let h = '';
  if (!ex.length) h += `<div class="card">${empty('Noch keine Übungen', 'Leg deine Übungen einmal an. Danach kannst du sie in jeden Plan einfügen.')}</div>`;
  else h += `<div class="card list">${ex.map(e => `<div class="li tap" data-a="exedit" data-id="${e.id}"><div class="li-m"><b>${esc(e.name)}</b><small>${exTags(e)}${e.note ? ' · ' + esc(e.note) : ''}</small></div><span class="chev">${IC.chev}</span></div>`).join('')}</div>`;
  return h + `<button class="btn pri block" data-a="exnew">+ Neue Übung</button>`;
}

// ================= Pläne =================
const DAYN = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const todayDay = () => (new Date().getDay() + 6) % 7 + 1;
function lastDone(planId) { const w = S.workouts.filter(w => w.planId === planId).sort((a, b) => b.start - a.start)[0]; return w ? w.start : null; }
function planCard(p, today) {
  const ld = lastDone(p.id);
  return `<div class="card plan ${today ? 'today' : ''}"><div class="plan-m tap" data-a="editplan" data-id="${p.id}">${today ? '<span class="pill a">Heute</span>' : ''}<b>${p.day ? `<span class="day">${DAYN[p.day]}</span>` : ''}${esc(p.name || 'Ohne Namen')}</b>
    <small>${plural(p.items.length, 'Übung', 'Übungen')}${ld ? ' · zuletzt ' + fdate(ld, false) : ''}</small>
    ${p.items.length ? `<span class="plan-ex">${p.items.map(i => esc(exName(i.exId))).join(' · ')}</span>` : ''}</div>
    <div class="plan-a"><button class="iconbtn ghost" data-a="planmenu" data-id="${p.id}" aria-label="Menü">${IC.more}</button><button class="btn pri sm" data-a="start" data-id="${p.id}">Start</button></div></div>`;
}
function viewTraining() {
  let h = apkBanner() + backupBanner() + restoreCard() + deloadReminder();
  if (S.active) {
    const done = S.active.items.reduce((a, i) => a + i.sets.filter(s => s.done).length, 0), tot = S.active.items.reduce((a, i) => a + i.sets.length, 0);
    h += `<div class="notice ok tap" data-a="resume"><div class="ri" style="padding:0"><div class="ri-l"><b>Training läuft: ${esc(S.active.name)}</b><small>${done}/${tot} Sätze · <span id="elapsed2">${mmss((Date.now() - S.active.start) / 1000)}</span></small></div><div class="ri-c"><button class="btn pri sm">Weiter</button></div></div></div>`;
  }
  h += deloadCard();
  h += seg('tseg', [['plans', 'Pläne'], ['exercises', 'Übungen']], ui.trainSeg);
  if (ui.trainSeg === 'exercises') return ['Training', h + viewExerciseList()];
  if (!S.plans.length) h += `<div class="card">${empty('Noch keine Pläne', 'Erstelle deinen ersten Trainingsplan. Übungen legst du direkt dabei an.')}</div>`;
  const td = todayDay(), plans = S.plans.slice().sort((a, b) => (a.day || 9) - (b.day || 9));
  const today = plans.find(p => p.day === td);
  if (today) h += planCard(today, true);
  else if (td === 7 && plans.some(p => p.day)) h += `<div class="card"><b>Heute ist Ruhetag</b><p class="info" style="margin-top:4px">Erholung gehört zum Training. Morgen geht's weiter.</p></div>`;
  plans.filter(p => p !== today).forEach(p => { h += planCard(p, false); });
  h += `<div class="two"><button class="btn" data-a="newplan">+ Neuer Plan</button><button class="btn" data-a="start" data-id="">Freies Training</button></div>`;
  return ['Training', h];
}
function newItem(exId) { return { id: uid(), exId, rir: '', note: '', alts: [], ss: false, sets: [{ t: 'n', goal: isTime(exOf(exId)) ? '30-45' : '8-10', rest: S.settings.rest }] }; }
const uniq = a => [...new Set(a)];
/** Satz-Beschriftungen: W, W2 … / T (Top Set) / B, B2 (Back-off) / 1, 2 … */
function setLabels(sets) { let w = 0, n = 0, b = 0; return sets.map(s => s.t === 'w' ? 'W' + (++w > 1 ? w : '') : s.t === 'top' ? 'T' : s.t === 'bo' ? 'B' + (++b > 1 ? b : '') : String(++n)); }
const badgeCls = t => t === 'w' ? 'w' : t === 'top' ? 'top' : t === 'bo' ? 'bo' : '';
const unitOf = ex => (isTime(ex) ? 's' : 'Wdh.') + (ex.perLeg ? '/Bein' : '');
function itemSum(it) {
  const ex = exOf(it.exId), w = it.sets.filter(s => s.t === 'w'), n = it.sets.filter(s => s.t !== 'w');
  const top = n.filter(s => s.t === 'top').length, bo = n.filter(s => s.t === 'bo').length;
  const goals = uniq(n.map(s => s.goal)), rests = uniq(n.map(s => s.rest));
  const kind = top ? `Top Set${bo ? ' + ' + bo + ' Back-off' : ''}` : plural(n.length, 'Satz', 'Sätze');
  return `${w.length ? w.length + ' Aufwärm · ' : ''}${kind}${n.length ? ` × ${goals.length <= 3 ? goals.map(esc).join(' / ') : 'versch.'} ${unitOf(ex)}${it.rir ? ' · RIR ' + esc(it.rir) : ''} · Pause ${rests.length === 1 ? mmss(rests[0]) : 'individuell'}` : ''}${it.ss ? ' · Supersatz' : ''}`;
}
function viewPlanEdit(id) {
  const p = S.plans.find(x => x.id === id);
  if (!p) { stack.pop(); return viewTraining(); }
  let h = `<label class="lbl">Name des Plans</label><input class="f" data-a="pname" value="${esc(p.name)}" placeholder="z.B. Push, Oberkörper A">
    <label class="lbl">Wochentag</label>${seg('pday', [['0', '–'], ...[1, 2, 3, 4, 5, 6, 7].map(d => [String(d), DAYN[d]])], String(p.day || 0))}`;
  h += `<div class="sec">Übungen</div>`;
  if (!p.items.length) h += `<div class="card">${empty('Noch leer', 'Füge deine erste Übung hinzu.')}</div>`;
  else h += `<div class="card list">${p.items.map((it, i) => `<div class="li tap" data-a="itemedit" data-id="${it.id}"><span class="num">${i + 1}</span><div class="li-m"><b>${esc(exName(it.exId))}</b><small>${itemSum(it)}</small></div><span class="chev">${IC.chev}</span></div>`).join('')}</div>`;
  h += `<button class="btn block" data-a="iadd">+ Übung hinzufügen</button>
    <button class="btn pri block" data-a="start" data-id="${p.id}" ${p.items.length ? '' : 'disabled'}>Training starten</button>
    <button class="btn danger block" data-a="pdel" data-id="${p.id}">Plan löschen</button>`;
  return [p.name || 'Neuer Plan', h];
}
function curPlan() { return S.plans.find(p => p.id === topView().id); }
/** Anzeige im kg-Feld der Vorlage: feste kg, Prozent (Aufwärmen) oder Faktor (Back-off) */
function tplKgText(st) {
  if (st.t === 'bo' && st.factor != null && st.kg == null) return fmt(st.factor * 100, 2) + '%';
  if (st.pct != null) return fmt(st.pct, 2) + '%';
  return st.kg === '' || st.kg == null ? '' : fmt(num(st.kg), 2);
}
function itemEditor(itemId) {
  const p = curPlan(), it = p && p.items.find(i => i.id === itemId); if (!it) return;
  const ex = exOf(it.exId), i = p.items.indexOf(it), labs = setLabels(it.sets);
  itemEditor.it = it;
  const rows = it.sets.map((st, si) => `<button class="badge ${badgeCls(st.t)}" data-a="tsw" data-s="${si}">${labs[si]}</button>
      ${hasKg(ex) ? `<input class="tgoal" inputmode="none" data-kp="kgpct" data-a="tkg" data-s="${si}" value="${tplKgText(st)}" placeholder="–">` : ''}
      <input class="tgoal" inputmode="none" data-kp="range" data-a="tgoal" data-s="${si}" value="${esc(st.goal)}" placeholder="${isTime(ex) ? '30' : '8-10'}">
      <div class="stepper"><button data-a="trest" data-s="${si}" data-d="-1">−</button><span>${st.rest ? mmss(st.rest) : 'Aus'}</span><button data-a="trest" data-s="${si}" data-d="1">+</button></div>
      <button class="iconbtn ghost x" data-a="tdel" data-s="${si}" ${it.sets.length < 2 ? 'disabled' : ''} aria-label="Satz entfernen">✕</button>`).join('');
  const alts = (it.alts || []).map(a => `<span class="chip on">${esc(exName(a))} <b class="tap" data-a="taltdel" data-id="${a}">✕</b></span>`).join('');
  modal(`<h3>${esc(ex.name)}</h3><div class="sub">${exTags(ex)} · <span class="tap acc" data-a="itexedit" data-id="${ex.id}">Übung bearbeiten</span></div>
    <div class="tsets ${hasKg(ex) ? 'kg' : ''}"><span>Satz</span>${hasKg(ex) ? `<span>${kgHead(ex)}</span>` : ''}<span>${isTime(ex) ? 'Sek.' : 'Wdh.'}</span><span>Pause</span><span></span>${rows}</div>
    <button class="btn block" data-a="tadd" style="margin-top:10px">+ Satz</button>
    <div class="hint">Tipp auf die Satzart: <b>1</b> normal → <b>W</b> Aufwärmen → <b>T</b> Top Set → <b>B</b> Back-off. kg fest (z.B. 20) oder in Prozent (z.B. 55%): beim Aufwärmen vom Top Set bzw. Arbeitsgewicht, beim Back-off vom tatsächlichen Top Set. Leer = Vorschlag aus deinem letzten Training.</div>
    <div class="list" style="margin-top:6px">
      ${rowItem('RIR-Ziel', `<input class="f sm c" inputmode="none" data-kp="range" data-a="trir" value="${esc(it.rir || '')}" placeholder="z.B. 1">`, 'Wiederholungen im Tank')}
      ${rowItem('Supersatz mit nächster Übung', `<label class="switch"><input type="checkbox" data-a="tss" ${it.ss ? 'checked' : ''}><span></span></label>`, 'Pause erst nach der nächsten Übung')}
    </div>
    <label class="lbl">Notiz im Plan (im Training sichtbar)</label><input class="f" data-a="tnote" value="${esc(it.note || '')}" placeholder="z.B. Sicherheitsablagen">
    <label class="lbl">Alternativen (im Training per Tipp tauschen)</label><div class="chips">${alts}<button class="chip" data-a="taltadd">+ Alternative</button></div>
    <div class="two"><button class="btn" data-a="imove" data-s="-1" ${i === 0 ? 'disabled' : ''}>↑ Nach oben</button><button class="btn" data-a="imove" data-s="1" ${i === p.items.length - 1 ? 'disabled' : ''}>↓ Nach unten</button></div>`,
    [{ l: 'Aus Plan entfernen', c: 'danger', f: () => { p.items = p.items.filter(x => x !== it); saveNow(); render(); } }, { l: 'Fertig', c: 'pri', f: () => { saveNow(); render(); } }]);
}

// ================= Training =================
/** Frühere Einheiten einer Übung, neueste zuerst */
function historyOf(exId) {
  return S.workouts.filter(w => w.items.some(i => i.exId === exId)).sort((a, b) => b.start - a.start)
    .map(w => ({ start: w.start, deload: !!w.deload, sets: w.items.filter(i => i.exId === exId).flatMap(i => i.sets) }));
}
function lastSets(exId, includeDeload) {
  const h = historyOf(exId).filter(x => includeDeload || !x.deload)[0] || (includeDeload ? null : historyOf(exId)[0]);
  return h ? { w: h, warm: h.sets.filter(s => s.t === 'w'), work: h.sets.filter(s => s.t !== 'w') } : null;
}
const exCfg = ex => ({ load: ex.load, mode: ex.mode, step: exStep(ex), barbell: !!ex.barbell });
/** Vorlage einer laufenden Übung (auch für Trainings aus älteren Versionen) */
function itTpl(it) {
  if (it.tpl) return it.tpl;
  return it.sets.map(st => ({ t: st.t, goal: st.goal || it.target || '8-10', rest: st.rest ?? (st.t === 'w' ? (it.warmRest || 0) : (it.rest ?? 120)) }));
}
/** Sätze für eine Übung im Training nach Plan, Historie, Woche und Deload */
function buildItem(pi, deload) {
  const ex = exOf(pi.exId), h = historyOf(pi.exId), tpl = pi.sets.map(x => ({ ...x }));
  const r = GL.buildSession(exCfg(ex), tpl, h, { info: weekNow(), deload, deloadCfg: S.settings.deload, lastStart: h[0] ? h[0].start : 0 });
  return { exId: pi.exId, alts: (pi.alts || []).slice(), tpl, rir: pi.rir || '', pnote: pi.note || '', ss: !!pi.ss, note: '', hint: r.hint, phase: r.note, sets: r.sets };
}
function applyDeloadToActive(on) {
  const a = S.active; if (!a) return;
  a.deload = on;
  a.items.forEach(it => {
    const fresh = buildItem({ exId: it.exId, sets: itTpl(it) }, on);
    const done = it.sets.filter(s => s.done);
    it.hint = fresh.hint; it.phase = fresh.phase; it.tpl = itTpl(it);
    it.sets = done.length ? done.concat(fresh.sets.filter(s => s.t !== 'w').slice(done.filter(s => s.t !== 'w').length)) : fresh.sets;
  });
}
function startWorkout(planId) {
  if (S.active) { toast('Es läuft schon ein Training'); stack = []; go('session'); return; }
  const p = S.plans.find(x => x.id === planId);
  if (p && !p.items.length) { toast('Der Plan hat noch keine Übungen'); return; }
  if (!S.settings.cycle.start) { S.settings.cycle.start = dkey(); setTimeout(syncReminder, 0); }
  const deload = deloadNow();
  S.active = { id: uid(), planId: p ? p.id : null, name: p ? (p.name || 'Training') : 'Freies Training', start: Date.now(), deload, week: weekNow().week, items: p ? p.items.map(pi => buildItem(pi, deload)) : [], timer: null };
  saveNow(); keepAwake(true);
  stack = []; go('session');
}
function keepAwake(on) { try { if (NATIVE) Android.keepScreenOn(on && S.settings.keepAwake); } catch (e) {} }
function prevText(exId) {
  const b = lastSets(exId, true), ex = exOf(exId);
  if (!b) return 'Zum ersten Mal';
  const labs = setLabels(b.work);
  return `${fdate(b.w.start, false)}${b.w.deload ? ' (Deload)' : ''}: ` + b.work.map((s, i) => (s.t === 'top' || s.t === 'bo' ? labs[i] + ' ' : '') + setTxt(ex, s)).join(' · ');
}
function lastNote(exId) { const ws = S.workouts.slice().sort((a, b) => b.start - a.start); for (const w of ws) { const it = w.items.find(i => i.exId === exId); if (it) return it.note ? { w, note: it.note } : null; } return null; }
function sessHead(it, ex) {
  const n = it.sets.filter(x => x.t !== 'w'); if (!n.length) return '';
  const g = uniq(n.map(x => x.goal || '')), r = uniq(n.map(x => x.rest));
  const rir = GL.rirTarget(it.rir, S.active.week ? weekNow() : null, S.active.deload);
  return `${g.length <= 3 ? g.map(esc).join(' / ') : 'versch.'} ${unitOf(ex)}${rir ? ' · RIR ' + esc(rir) : ''} · Pause ${it.ss ? 'nach Supersatz' : r.length === 1 ? mmss(r[0]) : 'individuell'}`;
}
function viewSession() {
  const a = S.active;
  if (!a) { stack.pop(); return viewTraining(); }
  const rirOn = S.settings.rir, wi = weekNow();
  let h = `<div class="sbar"><span><span id="elapsed">${mmss((Date.now() - a.start) / 1000)}</span> · ${fdate(a.start, false)}${weekStarted() ? ' · Woche ' + wi.week : ''}</span>
    <label class="sdl ${a.deload ? 'on' : ''}">Deload <label class="switch w sm"><input type="checkbox" data-a="sdeload" ${a.deload ? 'checked' : ''}><span></span></label></label></div>`;
  if (a.deload || wi.phase === 'reentry') h += `<div class="notice ${a.deload ? 'warn' : 'info'} small">${phaseText(wi, a.deload)}</div>`;
  if (!a.items.length) h += `<div class="card">${empty('Freies Training', 'Füge deine erste Übung hinzu.')}</div>`;
  a.items.forEach((it, idx) => {
    const ex = exOf(it.exId), kg = hasKg(ex), rir = rirOn && !isTime(ex), labs = setLabels(it.sets);
    const cols = `40px ${kg ? '1fr ' : ''}1fr ${rir ? '52px ' : ''}46px`;
    const prevSS = idx > 0 && a.items[idx - 1].ss;
    h += `<div class="card ex ${it.ss ? 'ss1' : ''} ${prevSS ? 'ss2' : ''}">${it.ss && a.items[idx + 1] ? `<div class="sslab">Supersatz mit ${esc(exName(a.items[idx + 1].exId))} · Pause erst danach</div>` : ''}
      <div class="ex-h"><div class="ex-t"><b>${esc(ex.name)}</b><small>${sessHead(it, ex)}</small></div><button class="iconbtn ghost" data-a="exmenu" data-id="${idx}" aria-label="Menü">${IC.more}</button></div>
      ${it.alts && it.alts.length ? `<button class="altchip" data-a="salt" data-id="${idx}">⇄ ${esc(it.alts.map(exName).join(' / '))}</button>` : ''}
      <div class="ex-prev">${esc(prevText(it.exId))}</div>`;
    if (it.phase) h += `<div class="hintchip info">${esc(it.phase)}</div>`;
    if (it.hint) h += `<div class="hintchip ${it.hint.dir}">${it.hint.dir === 'up' ? '↑' : '↓'} ${esc(it.hint.text)}</div>`;
    if (it.pnote) h += `<div class="note">📋 ${esc(it.pnote)}</div>`;
    if (ex.note) h += `<div class="note tap" data-a="snote" data-id="${idx}">📌 ${esc(ex.note)}</div>`;
    if (it.note) h += `<div class="note tap" data-a="snote" data-id="${idx}">📝 ${esc(it.note)}</div>`;
    else { const l = lastNote(it.exId); if (l) h += `<div class="note mut">📝 ${fdate(l.w.start, false)}: ${esc(l.note)}</div>`; }
    h += `<div class="sets" style="grid-template-columns:${cols}"><span>Satz</span>${kg ? `<span>${kgHead(ex)}</span>` : ''}<span>${valUnit(ex)}${ex.perLeg ? '/Bein' : ''}</span>${rir ? '<span class="tap blue" data-a="ririnfo">RIR ⓘ</span>' : ''}<span></span>`;
    it.sets.forEach((s, si) => {
      const c = `${badgeCls(s.t)} ${s.done ? 'done' : ''}`;
      h += `<button class="badge ${c}" data-a="stype" data-id="${idx}" data-s="${si}">${labs[si]}</button>`;
      if (kg) h += `<input class="${c}" inputmode="none" data-kp="dec" data-step="${exStep(ex)}" data-a="skg" data-id="${idx}" data-s="${si}" value="${s.kg === '' ? '' : fmt(num(s.kg), 2)}" placeholder="0">`;
      h += `<input class="${c}" inputmode="none" data-kp="int" data-step="${isTime(ex) ? 5 : 1}" data-a="sreps" data-id="${idx}" data-s="${si}" value="${s.reps}" placeholder="${esc(s.goal || '0')}">`;
      if (rir) h += s.t === 'w' ? '<span></span>' : `<input class="rir ${c}" inputmode="none" data-kp="int" maxlength="2" data-a="srir" data-id="${idx}" data-s="${si}" value="${s.rir ?? ''}" placeholder="–">`;
      h += `<button class="chk ${c}" data-a="sdone" data-id="${idx}" data-s="${si}" aria-label="Erledigt">${IC.check}</button>`;
    });
    h += `</div><div class="ex-f"><button class="btn sm" data-a="sadd" data-id="${idx}">+ Satz</button><button class="btn sm" data-a="swadd" data-id="${idx}">+ Aufwärmen</button><button class="btn sm" data-a="snote" data-id="${idx}">Notiz</button><span class="grow"></span><button class="btn sm" data-a="srem" data-id="${idx}">− Satz</button></div></div>`;
  });
  h += `<button class="btn block" data-a="sexadd">+ Übung hinzufügen</button>
    <button class="btn pri block" data-a="finish">Training beenden</button>
    <button class="btn danger block" data-a="discard">Training verwerfen</button>`;
  return [a.name, h];
}
/** Top Set / erster Arbeitssatz geändert: Aufwärmen und Back-off live nachziehen */
function recalcLive(idx) {
  const it = S.active.items[idx], ex = exOf(it.exId);
  GL.recalc(it.sets, exCfg(ex));
  it.sets.forEach((s, si) => {
    const inp = document.querySelector(`[data-a=skg][data-id="${idx}"][data-s="${si}"]`);
    if (inp && inp !== kpT && document.activeElement !== inp) inp.value = s.kg === '' ? '' : fmt(num(s.kg), 2);
  });
}
const scoreSet = (ex, s, ts) => isTime(ex) || ex.load === 'bw' ? s.reps : e1rm(effKg(ex, s, ts), s.reps);
function bestOf(exId) {
  const ex = exOf(exId); let b = 0;
  S.workouts.forEach(w => w.items.forEach(i => { if (i.exId === exId) i.sets.forEach(s => { if (s.t !== 'w') b = Math.max(b, scoreSet(ex, s, w.start)); }); }));
  return b;
}
function finishWorkout() {
  const a = S.active;
  const undone = a.items.reduce((n, i) => n + i.sets.filter(s => !s.done && num(s.reps) > 0).length, 0);
  const doFinish = includeUndone => {
    const items = a.items.map(i => {
      const o = { exId: i.exId, sets: i.sets.filter(s => (s.done || includeUndone) && num(s.reps) > 0).map(s => { const r = { t: s.t, kg: isFinite(num(s.kg)) ? num(s.kg) : 0, reps: num(s.reps) }; if (s.t !== 'w' && isFinite(num(s.rir))) r.rir = num(s.rir); return r; }) };
      if (i.note) o.note = i.note; return o;
    }).filter(i => i.sets.length);
    S.active = null; stopTimer(); keepAwake(false);
    if (!items.length) { saveNow(); stack = []; tab = 'training'; render(true); toast('Keine Sätze erledigt, nichts gespeichert'); return; }
    const w = { id: a.id, planId: a.planId, name: a.name, start: a.start, end: Date.now(), deload: a.deload, items };
    const prs = items.map(i => { const ex = exOf(i.exId), before = bestOf(i.exId), now = Math.max(0, ...i.sets.filter(s => s.t !== 'w').map(s => scoreSet(ex, s, w.start))); return before > 0 && now > before ? ex.name : null; }).filter(Boolean);
    S.workouts.push(w); saveNow();
    stack = []; tab = 'training'; render(true);
    const sets = items.reduce((t, i) => t + i.sets.filter(s => s.t !== 'w').length, 0);
    modal(`<h3>Stark! Training gespeichert 💪</h3><div class="list">
      ${rowItem('Dauer', `<b>${Math.round((w.end - w.start) / 60000)} min</b>`)}${rowItem('Übungen', `<b>${items.length}</b>`)}${rowItem('Arbeitssätze', `<b>${sets}</b>`)}</div>
      ${prs.length ? `<div class="notice ok small">🏆 Neuer Rekord: <b>${prs.map(esc).join(', ')}</b></div>` : ''}`, [{ l: 'Fertig', c: 'pri' }]);
  };
  if (undone > 0) modal(`<h3>Training beenden?</h3><p class="info">${plural(undone, 'Satz ist', 'Sätze sind')} nicht abgehakt.</p>`, [{ l: 'Nur abgehakte', f: () => doFinish(false) }, { l: 'Alle speichern', c: 'pri', f: () => doFinish(true) }]);
  else modal('<h3>Training beenden?</h3>', [{ l: 'Abbrechen' }, { l: 'Beenden', c: 'pri', f: () => doFinish(false) }]);
}

// ================= Pausentimer =================
function startTimer(sec) {
  if (!S.active || sec <= 0) return;
  S.active.timer = { end: Date.now() + sec * 1000, total: sec, fired: false };
  try { if (NATIVE) Android.startTimer(sec); } catch (e) {}
  saveSoon(); renderTimer();
}
function stopTimer() { if (S.active) S.active.timer = null; try { if (NATIVE) Android.cancelTimer(); } catch (e) {} renderTimer(); }
function adjTimer(d) {
  const t = S.active && S.active.timer; if (!t) return;
  t.end += d * 1000; t.total = Math.max(1, t.total + d);
  const left = (t.end - Date.now()) / 1000;
  if (left <= 0) { stopTimer(); return; }
  t.fired = false; try { if (NATIVE) Android.startTimer(Math.ceil(left)); } catch (e) {}
  saveSoon(); renderTimer();
}
function renderTimer() {
  const el = $('#timer'), t = S && S.active && S.active.timer;
  if (!t || !topView() || topView().v !== 'session') { el.classList.add('hidden'); return; }
  const left = (t.end - Date.now()) / 1000;
  if (left <= 0) {
    if (!t.fired) { t.fired = true; vib(400); beep(); saveSoon(); }
    if (left < -8) { S.active.timer = null; el.classList.add('hidden'); return; }
    el.className = 'end'; el.innerHTML = `<div class="t">Los!</div><div class="grow">Pause vorbei</div><button data-a="tskip">OK</button>`;
    return;
  }
  el.className = '';
  el.innerHTML = `<div class="t">${mmss(left)}</div><div class="grow mut">Pause</div><button data-a="tadj" data-id="-15">−15</button><button data-a="tadj" data-id="15">+15</button><button data-a="tskip">Skip</button><i style="width:${(1 - left / t.total) * 100}%"></i>`;
}
setInterval(() => {
  if (!S || !S.active) return;
  renderTimer();
  const e = $('#elapsed') || $('#elapsed2'); if (e) e.textContent = mmss((Date.now() - S.active.start) / 1000);
}, 250);
window.onAppResume = () => { if (!S) return; if (deloadAutoOff() && (!topView() || topView().v !== 'session')) render(); renderTimer(); };

// ================= Verlauf =================
function viewHistory() {
  let h = seg('hseg', [['workouts', 'Trainings'], ['exercises', 'Übungen'], ['muscles', 'Muskeln']], ui.histSeg);
  if (ui.histSeg === 'muscles') return ['Verlauf', h + viewMuscles()];
  if (ui.histSeg === 'workouts') {
    const ws = S.workouts.slice().sort((a, b) => b.start - a.start);
    if (!ws.length) return ['Verlauf', h + `<div class="card">${empty('Noch keine Trainings', 'Hier landen alle deine Trainings.')}</div>`];
    const thisW = ws.filter(w => monday(dkey(new Date(w.start))) === monday(dkey())).length;
    h += `<div class="stats"><div class="stat"><small>Diese Woche</small><b>${thisW}</b><small>Trainings</small></div><div class="stat"><small>Insgesamt</small><b>${ws.length}</b><small>Trainings</small></div></div>`;
    let lastWk = '', open = false;
    ws.forEach(w => {
      const k = monday(dkey(new Date(w.start)));
      if (k !== lastWk) { if (open) h += '</div>'; h += `<div class="sec">KW ${isoWeek(k)} · ${fdate(k, false)}</div><div class="card list">`; lastWk = k; open = true; }
      const sets = w.items.reduce((t, i) => t + i.sets.filter(s => s.t !== 'w').length, 0);
      h += `<div class="li tap" data-a="wdetail" data-id="${w.id}"><div class="li-m"><b>${esc(w.name)} ${w.deload ? '<span class="pill d">Deload</span>' : ''}</b><small>${fdate(w.start)} · ${Math.round((w.end - w.start) / 60000)} min · ${sets} Sätze</small></div><span class="chev">${IC.chev}</span></div>`;
    });
    if (open) h += '</div>';
  } else {
    const used = S.exercises.filter(e => S.workouts.some(w => w.items.some(i => i.exId === e.id))).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!used.length) return ['Verlauf', h + `<div class="card">${empty('Noch keine Daten', 'Nach deinem ersten Training siehst du hier die Entwicklung jeder Übung.')}</div>`];
    h += '<div class="card list">' + used.map(e => {
      const pts = exSeries(e.id), last = pts[pts.length - 1];
      return `<div class="li tap" data-a="exdetail" data-id="${e.id}"><div class="li-m"><b>${esc(e.name)}</b><small>${pts.length}× · zuletzt ${esc(setTxt(e, last.top))}</small></div><span class="chev">${IC.chev}</span></div>`;
    }).join('') + '</div>';
  }
  return ['Verlauf', h];
}
/** Arbeitssätze pro Muskel: diese Woche erledigt vs. laut Plan pro Woche */
function viewMuscles() {
  const byId = Object.fromEntries(S.exercises.map(e => [e.id, e]));
  const wk = monday(dkey());
  const done = GL.muscleSets(S.workouts.filter(w => monday(dkey(new Date(w.start))) === wk).flatMap(w => w.items), byId);
  const planned = GL.muscleSets(S.plans.filter(p => p.day).flatMap(p => p.items), byId);
  const ms = uniq([...Object.keys(planned), ...Object.keys(done)]).sort((a, b) => (planned[b] || 0) - (planned[a] || 0) || a.localeCompare(b, 'de'));
  if (!ms.length) return `<div class="card">${empty('Noch keine Zuordnung', 'Weise deinen Übungen Muskeln zu (Übung bearbeiten), dann siehst du hier die Sätze pro Muskel.')}</div>`;
  const rows = ms.map(m => {
    const d = done[m] || 0, p = planned[m] || 0;
    return `<div class="mrow"><div class="mrow-h"><b>${esc(m)}</b><span><b>${fmt(d, 1)}</b> <span class="mut">/ ${fmt(p, 1)}</span></span></div><div class="bar"><i style="width:${p ? Math.min(100, d / p * 100) : d ? 100 : 0}%"></i></div></div>`;
  }).join('');
  return `<div class="card"><div class="hint" style="margin:0 0 6px">Arbeitssätze diese Woche (KW ${isoWeek(dkey())}) / laut Plan pro Woche. Hauptmuskel zählt 1, mithelfende Muskeln 0,5.</div>${rows}</div>`;
}
function exSeries(exId) {
  const ex = exOf(exId), out = [];
  S.workouts.slice().sort((a, b) => a.start - b.start).forEach(w => w.items.filter(i => i.exId === exId).forEach(i => {
    const work = i.sets.filter(s => s.t !== 'w'); if (!work.length) return;
    let top = work[0]; work.forEach(s => { if (s.kg > top.kg || (s.kg === top.kg && s.reps > top.reps)) top = s; });
    out.push({ w, top, work,
      e1rm: Math.max(...work.map(s => e1rm(effKg(ex, s, w.start), s.reps))),
      kg: Math.max(...work.map(s => s.kg || 0)),
      maxv: Math.max(...work.map(s => s.reps)),
      sumv: work.reduce((t, s) => t + s.reps, 0),
      vol: work.reduce((t, s) => t + effKg(ex, s, w.start) * s.reps, 0) });
  }));
  return out;
}
function metricsFor(ex) {
  if (isTime(ex)) return [['maxv', 'Längste', 's'], ['sumv', 'Gesamt', 's']].concat(hasKg(ex) ? [['kg', ex.load === 'bwplus' ? '+kg' : 'kg', 'kg']] : []);
  if (ex.load === 'bw') return [['maxv', 'Max. Wdh.', ''], ['sumv', 'Wdh. gesamt', '']];
  return [['e1rm', '1RM', 'kg'], ['kg', ex.load === 'bwplus' ? '+kg' : 'Top-kg', 'kg'], ['vol', 'Volumen', 'kg'], ['sumv', 'Wdh.', '']];
}
function viewExercise(id) {
  const ex = exOf(id), pts = exSeries(id), ms = metricsFor(ex);
  if (!ms.some(m => m[0] === ui.exMetric)) ui.exMetric = ms[0][0];
  const [mk, mlab, unit] = ms.find(m => m[0] === ui.exMetric);
  let h = `<div class="sub" style="margin:0 4px 8px">${exTags(ex)}${ex.load !== 'weight' ? ' · Körpergewicht aus deinen Einträgen' : ''}</div>`;
  if (pts.length) {
    const k0 = ms[0][0], bestP = pts.reduce((b, p) => p[k0] > b[k0] ? p : b, pts[0]);
    const first = pts.find(p => !p.w.deload) || pts[0], last = pts.filter(p => !p.w.deload).pop() || pts[pts.length - 1];
    h += `<div class="stats"><div class="stat"><small>Bestwert ${ms[0][0] === 'e1rm' ? '(1RM geschätzt)' : '· ' + ms[0][1]}</small><b>${fmt(bestP[k0])}<em>${ms[0][2]}</em></b><small>${fdate(bestP.w.start, false)}</small></div>
      <div class="stat"><small>Trainings</small><b>${pts.length}</b><small>seit ${fdate(pts[0].w.start, false)}</small></div></div>
      <div class="card">${seg('exmetric', ms.map(m => [m[0], m[1]]), mk)}
      ${chartBox('ex', { h: 200, minPad: 1, series: [{ pts: pts.map(p => ({ x: p.w.start, y: p[mk], hollow: p.w.deload, label: `${fdate(p.w.start, false)} · <b>${fmt(p[mk])} ${unit}</b>${p.w.deload ? ' (Deload)' : ''}` })), color: 'var(--acc)', line: true, dots: true, r: 3.5 }] })}
      <div class="legend"><span>${delta(last[mk] - first[mk])} ${unit} seit Beginn</span><span>○ Deload</span></div></div>`;
  }
  h += `<div class="sec">Alle Einheiten</div><div class="card list">`;
  if (!pts.length) h += empty('Noch nicht trainiert');
  pts.slice().reverse().forEach(p => { h += `<div class="li tap" data-a="wdetail" data-id="${p.w.id}"><div class="li-m"><b>${fdate(p.w.start)} ${p.w.deload ? '<span class="pill d">Deload</span>' : ''}</b><small>${p.work.map(s => esc(setTxt(ex, s))).join(' · ')}</small></div></div>`; });
  h += '</div>';
  return [ex.name, h, ex.id ? `<button class="iconbtn ghost" data-a="exedit" data-id="${ex.id}" aria-label="Bearbeiten">${IC.more}</button>` : ''];
}
function viewWorkoutDetail(id) {
  const w = S.workouts.find(x => x.id === id);
  if (!w) { stack.pop(); return viewHistory(); }
  let h = `<div class="sub" style="margin:0 4px 8px">${fdate(w.start)} · ${new Date(w.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${Math.round((w.end - w.start) / 60000)} min ${w.deload ? '<span class="pill d">Deload</span>' : ''}</div>`;
  w.items.forEach((it, ii) => {
    const ex = exOf(it.exId), kg = hasKg(ex), rir = !isTime(ex);
    const cols = `40px ${kg ? '1fr ' : ''}1fr ${rir ? '52px' : ''}`;
    let nn = 0;
    h += `<div class="card ex"><div class="ex-h tap" data-a="exdetail" data-id="${it.exId}"><div class="ex-t"><b>${esc(ex.name)}</b></div><span class="chev">${IC.chev}</span></div>`;
    if (it.note) h += `<div class="note">📝 ${esc(it.note)}</div>`;
    h += `<div class="sets" style="grid-template-columns:${cols}"><span>Satz</span>${kg ? `<span>${kgHead(ex)}</span>` : ''}<span>${valUnit(ex)}</span>${rir ? '<span>RIR</span>' : ''}`;
    it.sets.forEach((s, si) => {
      const c = s.t === 'w' ? 'w' : '';
      h += `<span class="badge ${c}">${s.t === 'w' ? 'W' : ++nn}</span>`;
      if (kg) h += `<input class="${c}" inputmode="none" data-kp="dec" data-a="hkg" data-id="${w.id}" data-i="${ii}" data-s="${si}" value="${fmt(s.kg, 2)}">`;
      h += `<input class="${c}" inputmode="none" data-kp="int" data-step="${isTime(ex) ? 5 : 1}" data-a="hreps" data-id="${w.id}" data-i="${ii}" data-s="${si}" value="${s.reps}">`;
      if (rir) h += s.t === 'w' ? '<span></span>' : `<input class="rir" inputmode="none" data-kp="int" data-a="hrir" data-id="${w.id}" data-i="${ii}" data-s="${si}" value="${s.rir ?? ''}" placeholder="–">`;
    });
    h += '</div></div>';
  });
  h += `<div class="hint" style="margin:4px">Werte kannst du hier direkt korrigieren.</div><button class="btn danger block" data-a="wdel" data-id="${w.id}">Training löschen</button>`;
  return [w.name, h];
}

// ================= Mehr / Daten =================
function viewSettings() {
  const s = S.settings, vi = verInfo();
  const b = backupState();
  let h = apkBanner() + `<div class="sec">Sicherung</div><div class="card">${backupStatusHtml(b)}
    ${b.can ? `<button class="btn ${b.where && !b.err ? '' : 'pri'} block" data-a="pickbfile" style="margin-top:12px">${b.where ? 'Sicherungsdatei ändern' : 'Sicherung in Google Drive einrichten'}</button>
    <div class="hint">Im Dialog links im Menü <b>Drive</b> wählen und speichern. Danach wird die Datei bei jeder Änderung automatisch aktualisiert. Sie liegt privat in deinem Google-Konto, bleibt beim Löschen der App erhalten und auch wenn du das Handy verlierst.</div>` : ''}
    <div class="two"><button class="btn" data-a="export">Kopie exportieren</button><button class="btn" data-a="import">Wiederherstellen</button></div>
    <div class="hint">Wiederherstellen: Sicherungsdatei auswählen (z.B. aus Drive). Ersetzt die Daten auf dem Handy.</div></div>
  <div class="sec">Pausentimer</div><div class="card list">
    ${rowItem('Standardpause', stepper('tst', 'rest', mmss(s.rest)), 'Für neue Übungen im Plan')}
    ${rowItem('Pause nach Aufwärmen', stepper('tst', 'warmRest', s.warmRest ? mmss(s.warmRest) : 'Aus'))}
    ${rowItem('Vibration', toggle('sset', 'vibrate', s.vibrate))}
    ${rowItem('Ton', toggle('sset', 'sound', s.sound))}
    ${rowItem('Bildschirm anlassen', toggle('sset', 'keepAwake', s.keepAwake), 'Während des Trainings')}</div>
  <div class="sec">Training</div><div class="card list">
    ${rowItem('RIR erfassen', toggle('sset', 'rir', s.rir), 'Wiederholungen im Tank pro Satz')}
    ${rowItem('Gewichtsschritte', `<select class="f sm" data-a="stepkg">${[1, 1.25, 2, 2.5, 5].map(v => `<option value="${v}" ${s.step === v ? 'selected' : ''}>${fmt(v, 2)} kg</option>`).join('')}</select>`, 'Für Vorschläge und Deload')}
    <div class="li tap" data-a="deloadinfo"><div class="li-m"><b>Deload</b><small>Plan, Prozente und Erinnerung</small></div><span class="chev">${IC.chev}</span></div></div>`;
  h += `
  <div class="sec">App</div><div class="card list">
    ${rowItem('Version', `<span class="mut">${esc(vi.name)}${vi.web ? ' · Stand ' + vi.web : ''}</span>`, 'Offline nutzbar, aktualisiert sich online selbst')}
    ${NATIVE ? `<div class="li tap" data-a="chkupd"><div class="li-m"><b>Nach Updates suchen</b></div><span class="chev">${IC.chev}</span></div>` : ''}</div>`;
  return ['Mehr', h];
}
/** Sicherung außerhalb des Handys (Google Drive o.ä.) */
function backupState() {
  const can = NATIVE && !!Android.pickBackupFile;
  let bi = ''; if (NATIVE) { try { bi = Android.backupInfo(); } catch (e) {} }
  const [where, last, err] = bi ? bi.split('|') : ['', 0, ''];
  return { can, where, last: +last || 0, err: err || '' };
}
const hasData = () => S.weights.length || S.workouts.length || S.plans.length || S.exercises.length;
function backupStatusHtml(b) {
  const n = `${plural(S.weights.length, "Gewichtseintrag", "Gewichtseinträge")} · ${plural(S.workouts.length, 'Training', 'Trainings')} · ${plural(S.plans.length, 'Plan', 'Pläne')}`;
  if (!b.where) return `<div class="ri" style="padding:0"><div class="ri-l"><b class="warn">Noch keine Sicherung außerhalb des Handys</b><small>${n}</small></div></div>`;
  const t = b.last ? new Date(b.last).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nicht';
  return `<div class="ri" style="padding:0"><div class="ri-l"><b class="${b.err ? 'red' : 'acc'}">${b.err ? 'Sicherung fehlgeschlagen' : 'Gesichert ✓'}</b><small>${esc(b.where)} · zuletzt ${t}</small><small>${n}</small></div></div>`;
}
/** Hinweis oben, solange keine externe Sicherung läuft */
function backupBanner() {
  const b = backupState();
  if (!b.can || !hasData() || (b.where && !b.err)) return '';
  return `<div class="notice warn"><b>${b.err ? 'Sicherung fehlgeschlagen' : 'Sichere deine Daten'}</b>
    <p>${b.err ? 'Die Sicherungsdatei konnte nicht geschrieben werden. Bitte neu einrichten.' : 'Damit nichts verloren geht, auch wenn du die App löschst oder das Handy verlierst: einmal eine Sicherung in Google Drive einrichten. Dauert 10 Sekunden.'}</p>
    <button class="btn warnb block" data-a="pickbfile" style="margin-top:10px">Jetzt einrichten</button></div>`;
}
/** Leere App (z.B. neu installiert): Wiederherstellen anbieten */
function restoreCard() {
  if (S.weights.length || S.workouts.length || !NATIVE) return '';
  return `<div class="card"><b>Neu hier oder Handy gewechselt?</b><p class="info">Hast du schon eine Sicherung (GymLog-Backup.json, z.B. in Google Drive), hol dir damit alle Daten zurück.</p>
    <button class="btn pri block" data-a="import" style="margin-top:12px">Daten wiederherstellen</button></div>`;
}
function exportData() {
  const txt = JSON.stringify(S, null, 1), name = `GymLog-${dkey()}.json`;
  if (NATIVE) { Android.exportFile(txt, name); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click();
}
window.onImport = text => {
  let d; try { d = JSON.parse(text); } catch (e) { toast('Datei ist kein gültiges Backup'); return; }
  if (!d || !Array.isArray(d.weights) || !Array.isArray(d.workouts)) { toast('Datei ist kein GymLog-Backup'); return; }
  modal(`<h3>Daten wiederherstellen?</h3><p class="info">${d.weights.length} Gewichtseinträge, ${d.workouts.length} Trainings, ${(d.plans || []).length} Pläne. Deine aktuellen Daten werden ersetzt.</p>`,
    [{ l: 'Abbrechen' }, { l: 'Wiederherstellen', c: 'pri', f: () => { S = merge(DEFAULTS(), migrate(d)); saveNow(); stack = []; syncReminder(); render(true); toast('Wiederhergestellt ✓'); } }]);
};

// ================= Updates =================
let apkUpd = null, pendingReload = false;
function verInfo() { try { if (NATIVE && Android.versionInfo) { const [n, w] = Android.versionInfo().split('|'); return { name: n, web: +w }; } } catch (e) {} return { name: 'Web', web: 0 }; }
function safeToReload() { return !S.active && $('#modal').classList.contains('hidden') && !(document.activeElement && document.activeElement.matches('input,textarea,select')); }
function doReload() { saveNow(); try { Android.reloadApp(); } catch (e) { location.reload(); } }
window.onUpdateReady = () => { if (safeToReload()) doReload(); else pendingReload = true; };
window.onApkUpdate = (name, notes) => { apkUpd = { name, notes }; if (!topView() || topView().v !== 'session') render(); };
function maybeReload() { if (pendingReload && safeToReload()) { pendingReload = false; doReload(); } }
function apkBanner() {
  if (!apkUpd) return '';
  return `<div class="notice ok"><div class="ri" style="padding:0"><div class="ri-l"><b>Update ${esc(apkUpd.name)} verfügbar</b><small>${apkUpd.notes ? esc(apkUpd.notes) + ' · ' : ''}Deine Daten bleiben erhalten</small></div><div class="ri-c"><button class="btn pri sm" data-a="instupd">Installieren</button></div></div></div>`;
}
window.onNative = ev => {
  const m = { upToDate: 'Du hast die neueste Version', offline: 'Keine Internetverbindung', updateError: 'Update fehlgeschlagen, später nochmal', needInstallPermission: 'Bitte „Aus dieser Quelle zulassen“ aktivieren und nochmal tippen', downloading: 'Update wird geladen…', exported: 'Export gespeichert', exportError: 'Export fehlgeschlagen', importError: 'Datei konnte nicht gelesen werden', folderSet: 'Sicherungsordner eingerichtet', folderError: 'Ordner konnte nicht gesetzt werden', fileSet: 'Sicherung eingerichtet ✓ Ab jetzt wird automatisch gesichert', fileError: 'Sicherung konnte nicht geschrieben werden' };
  toast(m[ev] || ev);
  if (ev === 'folderSet' || ev === 'fileSet' || ev === 'fileError') { if (ev === 'folderSet') saveNow(); setTimeout(render, 300); }
};
$('#fileIn').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(window.onImport); e.target.value = ''; });

// ================= Modal =================
let modalBtns = [], modalGen = 0;
function modal(html, btns) {
  modalGen++;
  modalBtns = (btns || []).filter(Boolean);
  const m = $('#modal'), open = !m.classList.contains('hidden'), old = open && m.querySelector('.sheet');
  const sc = old ? old.scrollTop : 0;
  m.innerHTML = `<div class="sheet${open ? ' still' : ''}"><div class="grab"></div>${html}${modalBtns.length ? `<div class="btns">${modalBtns.map((b, i) => `<button class="btn ${b.c || ''}" data-a="mbtn" data-id="${i}">${esc(b.l)}</button>`).join('')}</div>` : ''}</div>`;
  m.classList.remove('hidden');
  if (open) m.querySelector('.sheet').scrollTop = sc;
}
function closeModal() { if (kpT && kpT.closest('#modal')) kpClose();
  $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; if (pendingReload) setTimeout(maybeReload, 300); }
$('#modal').addEventListener('click', e => {
  if (e.target.id !== 'modal') return;
  closeModal(); if (topView() && topView().v === 'plan') render();
});

// ================= Aktionen =================
const nextT = t => ({ n: 'w', w: 'top', top: 'bo', bo: 'n' })[t] || 'n';

const sIt = el => S.active.items[+el.dataset.id];
const A = {
  back: () => back(),
  tab: el => { tab = el.dataset.id; stack = []; render(true); },
  mbtn: el => { const b = modalBtns[+el.dataset.id], g = modalGen; const r = b && b.f ? b.f() : undefined; if (r !== false && g === modalGen) closeModal(); },
  // Gewicht
  wstep: el => { const i = $('#wIn'); i.value = fmtF(Math.max(0, (num(i.value) || 0) + parseFloat(el.dataset.id))); },
  wsave: () => {
    const kg = num($('#wIn').value);
    if (!(kg > 20 && kg < 400)) { toast('Bitte gültiges Gewicht eingeben'); return; }
    const d = dkey(); S.weights = S.weights.filter(w => w.d !== d); S.weights.push({ d, kg: Math.round(kg * 100) / 100 });
    saveNow(); render(); toast('Gespeichert: ' + fmtF(kg) + ' kg');
  },
  wrange: el => { ui.wRange = el.dataset.v; render(); },
  wlist: () => go('weights'),
  wadd: () => weightDialog(null),
  wedit: el => weightDialog(el.dataset.id),
  // Deload
  deload: el => { if (el.checked) { el.checked = false; askDeload(); } else setDeload(false); },
  deloadyes: () => { S.settings.deloadAck = monday(dkey()); saveNow(); render(); },
  deloadno: () => { S.settings.deloadDismissed = monday(dkey()); if (S.active && !S.active.items.some(i => i.sets.some(s => s.done))) applyDeloadToActive(false); saveNow(); render(); toast('Alles klar, diese Woche normal 💪'); },
  deloadinfo: () => go('deloadinfo'),
  dset: el => { const [a, b] = el.dataset.id.split('.'), [st, lo, hi] = DSET[el.dataset.id]; S.settings[a][b] = Math.min(hi, Math.max(lo, S.settings[a][b] + st * +el.dataset.s)); saveNow(); syncReminder(); render(); },
  remindset: el => { S.settings.deloadRemind = el.checked; saveNow(); syncReminder(); },
  deloadreset: () => { S.settings.deload = { weightPct: 10, repsPct: 0, setsPct: 50 }; Object.assign(S.settings.cycle, { reentry: 4, block: 7 }); saveNow(); syncReminder(); render(); },
  // Übungen
  tseg: el => { ui.trainSeg = el.dataset.v; render(); },
  exnew: () => exerciseEditor(null),
  exedit: el => exerciseEditor(el.dataset.id, () => render()),
  exmode: el => exerciseEditor.set('mode', el.dataset.v),
  exload: el => exerciseEditor.set('load', el.dataset.v),
  pickex: el => { const cb = exercisePicker.cb; closeModal(); cb(exOf(el.dataset.id)); },
  pickexnew: () => { const cb = exercisePicker.cb; exerciseEditor(null, e => { closeModal(); cb(e); }); },
  // Pläne
  newplan: () => { const p = { id: uid(), name: '', items: [] }; S.plans.push(p); saveNow(); go('plan', p.id); setTimeout(() => { const i = document.querySelector('[data-a=pname]'); i && i.focus(); }, 80); },
  editplan: el => go('plan', el.dataset.id),
  planmenu: el => {
    const p = S.plans.find(x => x.id === el.dataset.id);
    modal(`<h3>${esc(p.name || 'Plan')}</h3><div class="list">
      <div class="li tap" data-a="pm" data-v="edit" data-id="${p.id}"><div class="li-m"><b>Bearbeiten</b></div><span class="chev">${IC.chev}</span></div>
      <div class="li tap" data-a="pm" data-v="dup" data-id="${p.id}"><div class="li-m"><b>Duplizieren</b></div></div>
      <div class="li tap" data-a="pm" data-v="del" data-id="${p.id}"><div class="li-m"><b class="red">Plan löschen</b></div></div></div>`, [{ l: 'Schließen' }]);
  },
  pm: el => {
    const p = S.plans.find(x => x.id === el.dataset.id), v = el.dataset.v;
    closeModal();
    if (v === 'edit') go('plan', p.id);
    if (v === 'dup') { const c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.name = (p.name || 'Plan') + ' (Kopie)'; c.items.forEach(i => i.id = uid()); S.plans.splice(S.plans.indexOf(p) + 1, 0, c); saveNow(); render(); toast('Plan dupliziert'); }
    if (v === 'del') A.pdel(el);
  },
  pdel: el => {
    const p = S.plans.find(x => x.id === el.dataset.id);
    modal(`<h3>„${esc(p.name || 'Plan')}“ löschen?</h3><p class="info">Deine bisherigen Trainings und der Verlauf bleiben erhalten.</p>`,
      [{ l: 'Abbrechen' }, { l: 'Löschen', c: 'danger', f: () => { S.plans = S.plans.filter(x => x !== p); saveNow(); if (topView() && topView().v === 'plan') stack.pop(); render(true); } }]);
  },
  iadd: () => { const pid = topView().id; exercisePicker(e => { const p = S.plans.find(x => x.id === pid), it = newItem(e.id); p.items.push(it); saveNow(); render(); itemEditor(it.id); }); },
  tsw: el => {
    const st = itemEditor.it.sets[+el.dataset.s]; st.t = nextT(st.t);
    if (st.t === 'w' && st.rest === S.settings.rest) st.rest = S.settings.warmRest; else if (st.t === 'top' && st.rest === S.settings.warmRest) st.rest = S.settings.rest;
    if (st.t === 'bo') { if (st.pct != null) { st.factor = st.pct / 100; } if (st.factor == null && st.kg == null) st.factor = 0.875; delete st.pct; }
    else if (st.t !== 'w') { delete st.factor; delete st.pct; }
    else delete st.factor;
    saveNow(); itemEditor(itemEditor.it.id);
  },
  trir: () => {},
  tss: el => { itemEditor.it.ss = el.checked; saveNow(); },
  taltadd: () => { const it = itemEditor.it; exercisePicker(e => { if (e.id !== it.exId && !(it.alts = it.alts || []).includes(e.id)) it.alts.push(e.id); saveNow(); itemEditor(it.id); }, 'Alternative wählen'); },
  taltdel: el => { const it = itemEditor.it; it.alts = (it.alts || []).filter(a => a !== el.dataset.id); saveNow(); itemEditor(it.id); },
  pday: el => { const p = curPlan(); p.day = +el.dataset.v || null; saveNow(); render(); },
  exstep: el => exerciseEditor.set('step', +el.dataset.v),
  exbar: el => exerciseEditor.set('barbell', el.checked),
  exleg: el => exerciseEditor.set('perLeg', el.checked),
  exmus: el => exerciseEditor.set('muscle', el.dataset.v),
  trest: el => { const st = itemEditor.it.sets[+el.dataset.s]; st.rest = Math.max(0, Math.min(600, (st.rest || 0) + 15 * +el.dataset.d)); saveNow(); itemEditor(itemEditor.it.id); },
  tdel: el => { const it = itemEditor.it; if (it.sets.length > 1) it.sets.splice(+el.dataset.s, 1); saveNow(); itemEditor(it.id); },
  tadd: () => { const it = itemEditor.it, l = it.sets[it.sets.length - 1] || {}; it.sets.push({ t: 'n', kg: l.kg ?? '', kgAt: l.kgAt, goal: l.t === 'n' ? l.goal : (it.sets.find(x => x.t === 'n') || l).goal || '8-10', rest: l.t === 'n' ? l.rest : S.settings.rest }); saveNow(); itemEditor(it.id); },
  itexedit: el => { const it = itemEditor.it; exerciseEditor(el.dataset.id, () => { render(); if (curPlan() && curPlan().items.includes(it)) itemEditor(it.id); }); },
  itemedit: el => itemEditor(el.dataset.id),
  imove: el => {
    const p = curPlan(), it = itemEditor.it, i = p.items.indexOf(it), j = i + +el.dataset.s;
    if (j < 0 || j >= p.items.length) return;
    [p.items[i], p.items[j]] = [p.items[j], p.items[i]]; saveNow(); render(); itemEditor(it.id);
  },
  start: el => startWorkout(el.dataset.id),
  resume: () => { stack = []; go('session'); },
  // Training
  sdeload: el => { applyDeloadToActive(el.checked); saveNow(); render(); },
  sdone: el => {
    const it = sIt(el), s = it.sets[+el.dataset.s];
    s.done = !s.done;
    if (s.done) {
      if (!(num(s.reps) > 0)) { s.done = false; toast(`Erst ${isTime(exOf(it.exId)) ? 'Sekunden' : 'Wdh.'} eintragen`); return; }
      let sec = s.rest != null ? s.rest : (s.t === 'w' ? (it.warmRest || 0) : (it.rest || 0));
      if (it.ss && s.t !== 'w') sec = 0; // Supersatz: Pause erst nach der nächsten Übung
      const allDone = S.active.items.every(i => i.sets.every(x => x.done));
      if (sec > 0 && !allDone) startTimer(sec); else stopTimer();
      const nx = it.sets.find((x, i) => i > +el.dataset.s && !x.done && x.t === s.t);
      if (nx && nx.kg === '' && s.kg !== '') nx.kg = s.kg;
    }
    saveNow(); render();
  },
  stype: el => { const s = sIt(el).sets[+el.dataset.s]; s.t = nextT(s.t); if (s.t === 'bo' && s.factor == null) s.factor = 0.875; saveNow(); render(); },
  salt: el => {
    const idx = +el.dataset.id, it = S.active.items[idx];
    modal(`<h3>Übung tauschen</h3><p class="info">Jede Übung hat ihre eigene Historie und eigene Gewichtsvorschläge.</p><div class="list">${[it.exId, ...it.alts].map((id, k) => `<div class="li tap" data-a="saltpick" data-i="${idx}" data-id="${id}"><div class="li-m"><b>${esc(exName(id))}</b><small>${k === 0 ? 'aktuell' : prevText(id)}</small></div>${k ? `<span class="chev">${IC.chev}</span>` : ''}</div>`).join('')}</div>`, [{ l: 'Schließen' }]);
  },
  saltpick: el => {
    const idx = +el.dataset.i, it = S.active.items[idx], id = el.dataset.id;
    if (id === it.exId) { closeModal(); return; }
    if (it.sets.some(s => s.done)) { toast('Erst tauschen, bevor du Sätze abhakst'); return; }
    // Feste kg aus dem Plan gehören zur Originalübung, Prozente und Faktoren bleiben
    const tpl = itTpl(it).map(t => { const c = { ...t }; delete c.kg; delete c.kgAt; return c; });
    const fresh = buildItem({ exId: id, sets: tpl, alts: [it.exId, ...it.alts.filter(a => a !== id)], rir: it.rir, note: it.pnote, ss: it.ss }, S.active.deload);
    S.active.items[idx] = fresh; saveNow(); closeModal(); render(); toast('Getauscht: ' + exName(id));
  },
  sadd: el => { const it = sIt(el), l = it.sets.filter(s => s.t !== 'w').pop() || it.sets[it.sets.length - 1], tw = itTpl(it).filter(x => x.t !== 'w')[0] || {}; it.sets.push({ t: 'n', kg: l ? l.kg : '', reps: l ? l.reps : range(tw.goal)[0], rir: '', goal: l ? l.goal : tw.goal, rest: l && l.rest != null ? l.rest : (tw.rest ?? S.settings.rest), done: false }); saveNow(); render(); },
  swadd: el => { const it = sIt(el), n = it.sets.filter(s => s.t === 'w').length, f = it.sets.find(s => s.t !== 'w'), w0 = it.sets.find(s => s.t === 'w'); it.sets.splice(n, 0, { t: 'w', kg: f && num(f.kg) > 0 ? roundStep(num(f.kg) * 0.5, S.settings.step) : '', reps: f ? f.reps : '', rest: w0 && w0.rest != null ? w0.rest : S.settings.warmRest, done: false }); saveNow(); render(); },
  srem: el => { const it = sIt(el); let i = it.sets.length - 1; while (i >= 0 && it.sets[i].done) i--; if (i >= 0) it.sets.splice(i, 1); else toast('Nur offene Sätze können entfernt werden'); saveNow(); render(); },
  exmenu: el => {
    const idx = +el.dataset.id, it = S.active.items[idx];
    const restOf = t => { const x = it.sets.find(s => (s.t === 'w') === (t === 'w')); return x ? (x.rest ?? (t === 'w' ? it.warmRest : it.rest)) || 0 : 0; };
    modal(`<h3>${esc(exName(it.exId))}</h3><div class="list">
      ${rowItem('Pause Arbeitssätze', stepper('sst', 'n', mmss(restOf('n')), `data-i="${idx}"`), 'Gilt für alle Arbeitssätze heute')}
      ${rowItem('Pause Aufwärmsätze', stepper('sst', 'w', restOf('w') ? mmss(restOf('w')) : 'Aus', `data-i="${idx}"`))}</div>
      <div class="two" style="margin-top:12px"><button class="btn" data-a="smove" data-i="${idx}" data-s="-1" ${idx === 0 ? 'disabled' : ''}>↑ Nach oben</button><button class="btn" data-a="smove" data-i="${idx}" data-s="1" ${idx === S.active.items.length - 1 ? 'disabled' : ''}>↓ Nach unten</button></div>
      <div class="two"><button class="btn" data-a="sexedit" data-id="${it.exId}">Name / Typ ändern</button><button class="btn" data-a="sexhist" data-id="${it.exId}">Verlauf</button></div>`,
      [{ l: 'Entfernen', c: 'danger', f: () => { S.active.items.splice(idx, 1); saveNow(); render(); } }, { l: 'Fertig', c: 'pri', f: () => render() }]);
  },
  sst: el => {
    const idx = +el.dataset.i, it = S.active.items[idx], w = el.dataset.id === 'w';
    const cur = (it.sets.find(s => (s.t === 'w') === w) || {}).rest ?? (w ? it.warmRest : it.rest) ?? 0;
    const v = Math.max(0, Math.min(600, cur + 15 * +el.dataset.s));
    it.sets.forEach(s => { if ((s.t === 'w') === w) s.rest = v; });
    if (w) it.warmRest = v; else it.rest = v;
    saveNow(); A.exmenu({ dataset: { id: idx } });
  },
  sexedit: el => exerciseEditor(el.dataset.id, () => render()),
  smove: el => { const a = S.active.items, i = +el.dataset.i, j = i + +el.dataset.s; [a[i], a[j]] = [a[j], a[i]]; saveNow(); closeModal(); render(); },
  sexhist: el => { closeModal(); go('exercise', el.dataset.id); },
  snote: el => {
    const it = sIt(el), e = S.exercises.find(x => x.id === it.exId) || {};
    modal(`<h3>Notizen</h3><div class="sub">${esc(e.name)}</div>
      <label class="lbl">Immer anzeigen (z.B. Sitz Stufe 4, Griffbreite)</label><textarea class="f" id="mN1" rows="2">${esc(e.note || '')}</textarea>
      <label class="lbl">Nur heute (z.B. Schulter zwickt)</label><textarea class="f" id="mN2" rows="2">${esc(it.note || '')}</textarea>`,
      [{ l: 'Abbrechen' }, { l: 'Speichern', c: 'pri', f: () => { e.note = $('#mN1').value.trim(); it.note = $('#mN2').value.trim(); saveNow(); render(); } }]);
  },
  ririnfo: () => modal(`<h3>RIR: Wiederholungen im Tank</h3><p class="info">Wie viele saubere Wiederholungen wären noch gegangen?</p><div class="list">
    ${rowItem('<b>0</b>', '<span class="mut small">nichts ging mehr</span>')}${rowItem('<b>1–2</b>', '<span class="mut small">hart, ideal für Aufbau</span>')}${rowItem('<b>3–4</b>', '<span class="mut small">locker, Deload</span>')}</div>
    <p class="info">Das Feld ist freiwillig.</p>`, [{ l: 'OK', c: 'pri' }]),
  sexadd: () => exercisePicker(e => { S.active.items.push(buildItem(newItem(e.id), S.active.deload)); saveNow(); render(); setTimeout(() => { const v = $('#view'); v.scrollTop = v.scrollHeight; }, 30); }),
  finish: () => finishWorkout(),
  discard: () => modal('<h3>Training verwerfen?</h3><p class="info">Alle Eingaben dieses Trainings gehen verloren.</p>', [{ l: 'Abbrechen' }, { l: 'Verwerfen', c: 'danger', f: () => { S.active = null; stopTimer(); keepAwake(false); saveNow(); stack = []; tab = 'training'; render(true); } }]),
  tskip: () => stopTimer(),
  tadj: el => adjTimer(+el.dataset.id),
  // Verlauf
  hseg: el => { ui.histSeg = el.dataset.v; render(true); },
  wdetail: el => go('workout', el.dataset.id),
  exdetail: el => go('exercise', el.dataset.id),
  exmetric: el => { ui.exMetric = el.dataset.v; render(); },
  wdel: el => modal('<h3>Training löschen?</h3><p class="info">Das kann nicht rückgängig gemacht werden.</p>', [{ l: 'Abbrechen' }, { l: 'Löschen', c: 'danger', f: () => { S.workouts = S.workouts.filter(w => w.id !== el.dataset.id); saveNow(); stack.pop(); render(true); } }]),
  // Mehr
  sset: el => { S.settings[el.dataset.id] = el.checked; saveNow(); },
  tst: el => { const k = el.dataset.id; S.settings[k] = Math.max(0, Math.min(600, S.settings[k] + 15 * +el.dataset.s)); saveNow(); render(); },
  export: () => exportData(),
  import: () => { if (NATIVE) Android.importFile(); else $('#fileIn').click(); },
  pickfolder: () => Android.pickBackupFolder(),
  pickbfile: () => { if (Android.pickBackupFile) Android.pickBackupFile(); },
  chkupd: () => { toast('Suche nach Updates…'); Android.checkUpdates(); },
  instupd: () => Android.installUpdate()
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  if ((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'SELECT') return;
  if (A[el.dataset.a]) A[el.dataset.a](el, e);
});
document.addEventListener('change', e => {
  const el = e.target, a = el.dataset.a;
  if (a === 'cyclestart') { S.settings.cycle.start = el.value || null; saveNow(); syncReminder(); render(); }
  if (a === 'stepkg') { S.settings.step = +el.value; saveNow(); }
  if (a === 'hkg' || a === 'hreps' || a === 'hrir') {
    const w = S.workouts.find(x => x.id === el.dataset.id), s = w.items[+el.dataset.i].sets[+el.dataset.s], v = num(el.value);
    if (a === 'hrir' && el.value.trim() === '') delete s.rir;
    else if (isFinite(v) && v >= 0) s[{ hkg: 'kg', hreps: 'reps', hrir: 'rir' }[a]] = v;
    saveNow();
  }
});
document.addEventListener('input', e => {
  const el = e.target, a = el.dataset.a;
  if (a === 'pname') { curPlan().name = el.value; $('#top h1').textContent = el.value || 'Neuer Plan'; saveSoon(); }
  if (a === 'tkg' && itemEditor.it) {
    const st = itemEditor.it.sets[+el.dataset.s], f = GL.parseKgField(el.value);
    delete st.pct; delete st.kgAt; if (st.t === 'bo') delete st.factor; delete st.kg;
    if (f.pct != null) { if (st.t === 'bo') st.factor = f.pct / 100; else if (st.t === 'w') st.pct = f.pct; }
    else if (f.kg != null) { st.kg = f.kg; st.kgAt = Date.now(); }
    saveSoon();
  }
  if (a === 'trir' && itemEditor.it) { itemEditor.it.rir = el.value.trim(); saveSoon(); }
  if (a === 'tnote' && itemEditor.it) { itemEditor.it.note = el.value; saveSoon(); }
  if (a === 'tgoal' && itemEditor.it) { itemEditor.it.sets[+el.dataset.s].goal = el.value.trim(); saveSoon(); }
  if (a === 'srir') { const s = sIt(el).sets[+el.dataset.s], v = num(el.value.trim()); s.rir = isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : ''; saveSoon(); }
  if (a === 'skg' || a === 'sreps') {
    const it = sIt(el), s = it.sets[+el.dataset.s], f = a === 'skg' ? 'kg' : 'reps', v = el.value.trim();
    s[f] = v === '' ? '' : (isFinite(num(v)) ? num(v) : s[f]);
    if (a === 'skg') {
      const ref = it.sets.find(x => x.t === 'top') || it.sets.find(x => x.t !== 'w');
      if (s === ref) {
        // leere Folgesätze gleicher Art übernehmen das Gewicht, bis du sie selbst änderst
        it.sets.forEach(x => { if (x !== s && x.t === s.t && !x.done && (x.kg === '' || x.auto)) { x.kg = s.kg; x.auto = true; } });
        recalcLive(+el.dataset.id);
      } else { delete s.auto; if (s.t === 'bo' || (s.t === 'w' && s.pct != null)) s.manual = true; }
    }
    saveSoon();
  }
});
document.addEventListener('focusin', e => { if (e.target.matches('.sets input, #wIn')) setTimeout(() => e.target.select(), 0); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.sets input, #wIn')) e.target.blur(); });

// ================= Zahlentastatur =================
let kpT = null, kpFresh = false;
const kpEl = () => $('#kp');
function kpScope(el) { return el.closest('#modal') || $('#view'); }
function kpNext(el) { const all = [...kpScope(el).querySelectorAll('[data-kp]')]; return all[all.indexOf(el) + 1] || null; }
function kpStep(el) { return el.dataset.step ? parseFloat(el.dataset.step) : (el.dataset.kp === 'dec' || el.dataset.kp === 'kgpct') ? S.settings.step : 1; }
function kpOpen(el) {
  if (kpT && kpT !== el) kpCommit();
  if (kpT) kpT.classList.remove('kpf');
  kpT = el; kpFresh = true; el.classList.add('kpf');
  const t = el.dataset.kp, st = kpStep(el), nx = kpNext(el);
  const k = (v, l = v, c = '') => `<button class="${c}" data-k="${v}">${l}</button>`;
  kpEl().innerHTML = `<div class="kpg">
    ${k('1')}${k('2')}${k('3')}${k('del', '⌫', 'fn')}
    ${k('4')}${k('5')}${k('6')}${t === 'range' ? k('-', '–', 'fn') : k('minus', '−' + fmt(st, 2), 'fn')}
    ${k('7')}${k('8')}${k('9')}${t === 'range' ? '<span></span>' : k('plus', '+' + fmt(st, 2), 'fn')}
    ${t === 'dec' || t === 'kgpct' ? k(',') : '<span></span>'}${k('0')}${t === 'kgpct' ? k('%', '%', 'fn') : k('done', 'Fertig', 'fn')}${k(nx ? 'next' : 'done', nx ? 'Weiter' : 'OK', 'go')}</div>`;
  kpEl().classList.remove('hidden'); document.body.classList.add('kp-open');
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
}
function kpCommit() { if (kpT) kpT.dispatchEvent(new Event('change', { bubbles: true })); }
function kpClose() {
  if (!kpT) return;
  kpCommit(); kpT.classList.remove('kpf'); try { kpT.blur(); } catch (e) {}
  kpT = null; kpEl().classList.add('hidden'); document.body.classList.remove('kp-open');
}
function kpSet(v) { kpT.value = v; kpT.dispatchEvent(new Event('input', { bubbles: true })); }
function kpKey(k) {
  const el = kpT; if (!el) return;
  if (!document.body.contains(el)) { kpClose(); return; }
  let v = kpFresh ? '' : el.value;
  if (k === 'done') { kpClose(); return; }
  if (k === 'next') { const n = kpNext(el); kpCommit(); if (n) { n.focus(); kpOpen(n); } else kpClose(); return; }
  if (k === 'del') { kpFresh = false; kpSet(el.value.slice(0, -1)); return; }
  if (k === 'minus' || k === 'plus') {
    const pc = el.value.trim().endsWith('%'), st = pc ? 5 : kpStep(el), cur = num(el.value.replace('%', '')) || 0, n = Math.max(0, Math.round((cur + (k === 'plus' ? st : -st)) * 100) / 100);
    kpFresh = false; kpSet(pc ? fmt(n, 2) + '%' : (el.dataset.kp === 'dec' || el.dataset.kp === 'kgpct') ? fmt(n, 2) : String(Math.round(n))); return;
  }
  if (k === ',' && (v.includes(',') || v.includes('%') || !['dec', 'kgpct'].includes(el.dataset.kp))) return;
  if (k === '%' && (v.includes('%') || v === '')) return;
  if (v.includes('%')) return;
  if (k === '-' && (v.includes('-') || v === '')) return;
  if (v.length >= 7) return;
  kpFresh = false; kpSet(v + k);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-kp]');
  if (el) { if (el !== kpT) kpOpen(el); return; }
}, true);
document.addEventListener('pointerdown', e => {
  if (!kpT) return;
  if (e.target.closest('#kp') || e.target.closest('[data-kp]')) return;
  kpClose();
}, true);
kpEl().addEventListener('mousedown', e => e.preventDefault());
kpEl().addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) kpKey(b.dataset.k); });

// ================= Start =================
load();
// Trainingsplan einmalig übernehmen (nur beim ersten Start dieser Version, nie bei einem Import)
(() => {
  let done = false; try { done = localStorage.getItem('seed') === GL_PROGRAM.SEED_ID; } catch (e) {}
  if (!done && GL_PROGRAM.applyProgram(S, uid, Date.now())) { saveNow(); setTimeout(() => toast('Dein Trainingsplan ist eingerichtet 💪'), 600); }
  try { localStorage.setItem('seed', GL_PROGRAM.SEED_ID); } catch (e) {}
})();
deloadAutoOff();
syncReminder();
if (S.active) { stack = [{ v: 'session' }]; tab = 'training'; keepAwake(true); }
else if (!S.weights.some(w => w.d === dkey()) && new Date().getHours() < 12) tab = 'weight';
else tab = 'training';
render(true);
(() => { const v = verInfo().web; let last = 0; try { last = +localStorage.getItem('webVer') || 0; localStorage.setItem('webVer', v); } catch (e) {} if (last && v > last) toast('App aktualisiert ✓'); })();
window.addEventListener('resize', () => document.querySelectorAll('.chart[data-chart]').forEach(drawChartInto));
