'use strict';
/* GymLog: Körpergewicht + Training. Alle Daten lokal, dauerhaft gespeichert. */

// ---------- Speicher ----------
const NATIVE = typeof window.Android !== 'undefined';
const KEY = 'gymlog';
const DEFAULTS = () => ({
  v: 1,
  weights: [],     // {d:'YYYY-MM-DD', kg}
  exercises: [],   // {id, name}
  plans: [],       // {id, name, items:[{id, exId, warm, sets, reps, rest, warmRest, warmRestSec}]}
  workouts: [],    // {id, planId, name, start, end, deload, items:[{exId, sets:[{t, kg, reps}]}]}
  active: null,
  settings: {
    rest: 120, warmRest: true, warmRestSec: 60, step: 2.5,
    vibrate: true, sound: true, keepAwake: true, rir: true,
    deloadOn: false,
    deload: { weightPct: 10, repsPct: 20, setsPct: 40 },
    cycle: { start: null, firstBlock: 8, block: 6, lastDeloadEnd: null, deloadStart: null, count: 0 }
  }
});

let S;
function merge(def, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj === undefined ? def : obj;
  const out = Array.isArray(def) ? [] : { ...def };
  for (const k in obj) out[k] = (def && typeof def[k] === 'object' && def[k] && !Array.isArray(def[k])) ? merge(def[k], obj[k]) : obj[k];
  return out;
}
function load() {
  let raw = '';
  try { raw = NATIVE ? Android.load() : localStorage.getItem(KEY); } catch (e) {}
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (e) {}
  S = merge(DEFAULTS(), data || {});
}
let saveT = null;
function saveNow() {
  clearTimeout(saveT); saveT = null;
  const txt = JSON.stringify(S);
  try { if (NATIVE) Android.save(txt); else localStorage.setItem(KEY, txt); }
  catch (e) { toast('Speichern fehlgeschlagen!'); }
}
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) saveNow(); });
window.addEventListener('pagehide', () => { if (saveT) saveNow(); });

// ---------- Helfer ----------
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pdate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const DAY = 864e5;
const num = v => { if (v === '' || v == null) return NaN; return parseFloat(String(v).replace(',', '.')); };
const fmt = (v, dec = 1) => isFinite(v) ? Number(v).toLocaleString('de-DE', { maximumFractionDigits: dec, minimumFractionDigits: 0 }) : '';
const fmtF = (v, dec = 1) => isFinite(v) ? Number(v).toLocaleString('de-DE', { maximumFractionDigits: dec, minimumFractionDigits: dec }) : '';
const roundStep = (v, step) => Math.round(v / step) * step;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const fdate = (k, wd = true) => { const d = typeof k === 'string' ? pdate(k) : new Date(k); return (wd ? WD[d.getDay()] + ', ' : '') + d.getDate() + '. ' + MON[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
function monday(k) { const d = pdate(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dkey(d); }
function isoWeek(k) { const d = pdate(k); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const y = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - y) / DAY - 3 + (y.getDay() + 6) % 7) / 7); }
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
const exName = id => (S.exercises.find(e => e.id === id) || {}).name || 'Übung';
function exByName(name) {
  name = name.trim(); if (!name) return null;
  let e = S.exercises.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!e) { e = { id: uid(), name }; S.exercises.push(e); }
  return e;
}
function repRange(r) { const n = String(r || '').match(/\d+/g); if (!n) return [8, 8]; return [+n[0], +n[n.length - 1]]; }
const e1rm = (kg, reps) => reps > 0 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : 0;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2200); }
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
document.addEventListener('pointerdown', () => { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }, { once: false, passive: true });

// ---------- Icons ----------
const IC = {
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9a4 4 0 0 1 8 0"/><path d="M12 9l1.5-2"/></svg>',
  dumb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

// ---------- Navigation ----------
let tab = 'weight';
let stack = []; // Unteransichten: {v:'plan'|'workout'|'exercise'|'session', id}
let ui = { wRange: '3M', histSeg: 'workouts', exMetric: 'e1rm' };
const topView = () => stack[stack.length - 1];
function go(v, id) { stack.push({ v, id }); render(true); }
function back() {
  if (!$('#modal').classList.contains('hidden')) { closeModal(); return true; }
  if (stack.length) { stack.pop(); render(true); return true; }
  if (tab !== 'training') { tab = 'training'; render(true); return true; }
  return false;
}
window.onBack = back;
function setTab(t) { tab = t; stack = []; render(true); }

function render(resetScroll) {
  const view = $('#view'); const sc = view.scrollTop;
  const t = topView();
  let title = '', body = '', backBtn = false, right = '';
  if (t && t.v === 'plan') { [title, body, right] = viewPlanEdit(t.id); backBtn = true; }
  else if (t && t.v === 'session') { [title, body, right] = viewSession(); backBtn = true; }
  else if (t && t.v === 'workout') { [title, body] = viewWorkoutDetail(t.id); backBtn = true; }
  else if (t && t.v === 'exercise') { [title, body, right] = viewExercise(t.id); backBtn = true; }
  else if (t && t.v === 'weights') { [title, body] = viewWeightList(); backBtn = true; }
  else if (t && t.v === 'deloadinfo') { [title, body] = viewDeloadInfo(); backBtn = true; }
  else if (tab === 'weight') [title, body] = viewWeight();
  else if (tab === 'training') [title, body] = viewTraining();
  else if (tab === 'history') [title, body] = viewHistory();
  else [title, body] = viewSettings();
  $('#top').innerHTML = (backBtn ? '<button class="back" data-a="back">‹</button>' : '') + `<h1>${esc(title)}</h1>` + (right || '');
  view.innerHTML = body;
  view.scrollTop = resetScroll ? 0 : sc;
  const inSession = t && t.v === 'session';
  $('#nav').classList.toggle('hidden', !!inSession);
  $('#nav').innerHTML = [['weight', 'Gewicht', IC.scale], ['training', 'Training', IC.dumb], ['history', 'Verlauf', IC.chart], ['settings', 'Mehr', IC.cog]]
    .map(([k, l, i]) => `<button class="${tab === k && !stack.length ? 'on' : ''}" data-a="tab" data-id="${k}">${i}<span>${l}</span></button>`).join('');
  view.querySelectorAll('.chart[data-chart]').forEach(drawChartInto);
  renderTimer();
}

// ---------- Charts (SVG, offline) ----------
const charts = {};
function chartBox(id, cfg) { charts[id] = cfg; return `<div class="chart" data-chart="${id}"></div>`; }
function drawChartInto(el) {
  const cfg = charts[el.dataset.chart]; if (!cfg) return;
  const W = el.clientWidth || 340, H = cfg.h || 190, pl = 40, pr = 10, pt = 14, pb = 24;
  const all = cfg.series.flatMap(s => s.pts);
  if (all.length === 0) { el.innerHTML = '<div class="empty small">Noch keine Daten</div>'; return; }
  let x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
  if (cfg.xmin != null) x0 = Math.min(x0, cfg.xmin);
  if (x1 - x0 < DAY) { x0 -= DAY * 3; x1 += DAY * 3; }
  let y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
  const padY = Math.max((y1 - y0) * 0.12, cfg.minPad || 0.5); y0 -= padY; y1 += padY;
  const X = x => pl + (x - x0) / (x1 - x0) * (W - pl - pr);
  const Y = y => pt + (1 - (y - y0) / (y1 - y0)) * (H - pt - pb);
  let g = '';
  // Gitter
  const steps = 4; for (let i = 0; i <= steps; i++) {
    const v = y0 + (y1 - y0) * i / steps, yy = Y(v);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="#2A2F3A" stroke-width="1"/>`;
    g += `<text x="${pl - 6}" y="${yy + 4}" fill="#8C93A3" font-size="10" text-anchor="end">${fmt(v, (y1 - y0) < 10 ? 1 : 0)}</text>`;
  }
  // x-Beschriftung
  const span = x1 - x0, nx = Math.min(5, Math.max(2, Math.floor(W / 80)));
  for (let i = 0; i <= nx; i++) {
    const x = x0 + span * i / nx, d = new Date(x);
    const lab = span > 400 * DAY ? MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) : d.getDate() + '. ' + MON[d.getMonth()];
    g += `<text x="${X(x)}" y="${H - 6}" fill="#8C93A3" font-size="10" text-anchor="${i === 0 ? 'start' : i === nx ? 'end' : 'middle'}">${lab}</text>`;
  }
  cfg.series.forEach(s => {
    const pts = s.pts.slice().sort((a, b) => a.x - b.x);
    if (s.line && pts.length > 1) g += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2.5}" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')}"/>`;
    if (s.dots) pts.forEach(p => { g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${s.r || 3}" fill="${p.hollow ? '#0F1115' : s.color}" stroke="${s.color}" stroke-width="${p.hollow ? 1.5 : 0}" opacity="${s.op || 1}"/>`; });
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}">${g}<line class="cur" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="#ECEEF2" stroke-width="1" opacity="0"/><circle class="curp" r="5" fill="#ECEEF2" opacity="0"/></svg><div class="tip hidden"></div>`;
  const main = cfg.series[cfg.tipSeries || 0].pts.slice().sort((a, b) => a.x - b.x);
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cur = el.querySelector('.cur'), curp = el.querySelector('.curp');
  const show = ev => {
    if (!main.length) return;
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
    let best = main[0]; for (const p of main) if (Math.abs(X(p.x) - px) < Math.abs(X(best.x) - px)) best = p;
    const cx = X(best.x), cy = Y(best.y);
    cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); cur.setAttribute('opacity', .3);
    curp.setAttribute('cx', cx); curp.setAttribute('cy', cy); curp.setAttribute('opacity', 1);
    tip.classList.remove('hidden'); tip.innerHTML = best.label || fmt(best.y);
    tip.style.left = Math.min(Math.max(cx / W * r.width, 60), r.width - 60) + 'px';
  };
  svg.addEventListener('pointerdown', show); svg.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') show(e); });
}

// ---------- Körpergewicht ----------
function weightsSorted() { return S.weights.slice().sort((a, b) => a.d < b.d ? -1 : 1); }
function weeklyAvgs() {
  const m = {};
  for (const w of S.weights) { const k = monday(w.d); (m[k] = m[k] || []).push(w.kg); }
  return Object.keys(m).sort().map(k => ({ wk: k, avg: m[k].reduce((a, b) => a + b, 0) / m[k].length, n: m[k].length }));
}
function viewWeight() {
  const today = dkey();
  const ws = weightsSorted();
  const todayW = S.weights.find(w => w.d === today);
  const last = ws[ws.length - 1];
  const pre = todayW ? todayW.kg : (last ? last.kg : 75);
  const weeks = weeklyAvgs();
  const cur = weeks[weeks.length - 1], prev = weeks[weeks.length - 2];
  const curIsThis = cur && cur.wk === monday(today);
  let h = `<div class="card">
    <div class="row between"><div class="mut small">${todayW ? 'Heute eingetragen' : 'Heute, ' + fdate(today, false)}</div>${todayW ? '<span class="pill a">✓ gespeichert</span>' : ''}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-a="wstep" data-id="-0.1" style="width:56px;font-size:22px">−</button>
      <div class="grow" style="text-align:center"><input id="wIn" class="big" inputmode="decimal" value="${fmtF(pre)}" style="width:100%;text-align:center;background:none;border:0;outline:none;color:var(--text)"><div class="mut small">kg</div></div>
      <button class="btn" data-a="wstep" data-id="0.1" style="width:56px;font-size:22px">+</button>
    </div>
    <button class="btn pri block" style="margin-top:12px" data-a="wsave">${todayW ? 'Aktualisieren' : 'Gewicht speichern'}</button>
  </div>`;
  if (cur) {
    const d = prev ? cur.avg - prev.avg : NaN;
    h += `<div class="grid2">
      <div class="card" style="margin:0"><div class="mut small">${curIsThis ? 'Diese Woche' : 'KW ' + isoWeek(cur.wk)} Ø</div><div class="mid">${fmtF(cur.avg)} <span class="small mut">kg</span></div><div class="tiny mut">${cur.n} Messung${cur.n === 1 ? '' : 'en'}</div></div>
      <div class="card" style="margin:0"><div class="mut small">vs. Vorwoche</div><div class="mid delta ${d > 0 ? 'up' : 'down'}">${isFinite(d) ? (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '± ') + fmtF(d) : '–'}</div><div class="tiny mut">${prev ? 'Ø ' + fmtF(prev.avg) + ' kg' : 'noch keine Vorwoche'}</div></div>
    </div>`;
    // Trend über 4 Wochen
    if (weeks.length >= 3) {
      const n = Math.min(5, weeks.length), a = weeks[weeks.length - n];
      const per = (cur.avg - a.avg) / ((pdate(cur.wk) - pdate(a.wk)) / (7 * DAY));
      h += `<div class="card small"><div class="row between"><span class="mut">Trend (letzte ${n} Wochen)</span><b class="delta ${per > 0 ? 'up' : 'down'}">${per > 0 ? '+' : ''}${fmtF(per, 2)} kg / Woche</b></div></div>`;
    }
  }
  const ranges = { '1M': 31, '3M': 92, '6M': 183, '1J': 366, 'Alle': 1e6 };
  const minX = Date.now() - ranges[ui.wRange] * DAY;
  const daily = ws.filter(w => pdate(w.d) >= minX).map(w => ({ x: +pdate(w.d), y: w.kg, label: `${fdate(w.d)}: <b>${fmtF(w.kg)} kg</b>` }));
  const wk = weeks.filter(w => +pdate(w.wk) + 6 * DAY >= minX).map(w => ({ x: +pdate(w.wk) + 3 * DAY, y: w.avg, label: `KW ${isoWeek(w.wk)} Ø <b>${fmtF(w.avg)} kg</b>` }));
  h += `<h2>Verlauf</h2><div class="card">
    <div class="chips">${Object.keys(ranges).map(r => `<button class="chip ${ui.wRange === r ? 'on' : ''}" data-a="wrange" data-id="${r}">${r}</button>`).join('')}</div>
    ${chartBox('w', { h: 200, tipSeries: 1, series: [{ pts: daily, color: '#6BB8FF', dots: true, r: 2.5, op: .55 }, { pts: wk, color: '#7CF29C', line: true, dots: true, r: 3.5 }] })}
    <div class="row small mut" style="gap:14px;margin-top:6px"><span><span style="color:#6BB8FF">●</span> Tageswerte</span><span><span style="color:#7CF29C">━</span> Wochenschnitt</span></div>
  </div>`;
  h += `<h2>Wochenschnitte</h2><div class="card list">`;
  if (!weeks.length) h += '<div class="empty small">Trag dein erstes Gewicht ein. Am besten jeden Morgen nach dem Aufstehen, nüchtern.</div>';
  weeks.slice().reverse().slice(0, 12).forEach((w, i, arr) => {
    const p = weeks[weeks.length - 2 - i]; const d = p ? w.avg - p.avg : NaN;
    h += `<div class="wrow"><div><b>KW ${isoWeek(w.wk)}</b> <span class="mut small">${fdate(w.wk, false)}</span><div class="tiny mut">${w.n}× gemessen</div></div>
      <div style="text-align:right"><b>${fmtF(w.avg)} kg</b><div class="small delta ${d > 0 ? 'up' : 'down'}">${isFinite(d) ? (d > 0 ? '+' : '') + fmtF(d) : ''}</div></div></div>`;
  });
  h += `</div><div class="grid2"><button class="btn ghost" data-a="wlist">Alle Einträge</button><button class="btn ghost" data-a="wadd">Nachtragen</button></div>`;
  return ['Körpergewicht', h];
}
function viewWeightList() {
  const ws = weightsSorted().reverse();
  let h = '<div class="card list">';
  if (!ws.length) h += '<div class="empty">Keine Einträge</div>';
  ws.forEach(w => { h += `<div class="it tap" data-a="wedit" data-id="${w.d}"><div class="grow">${fdate(w.d)}</div><b>${fmtF(w.kg)} kg</b><span class="mut">›</span></div>`; });
  return ['Alle Einträge', h + '</div>'];
}
function weightDialog(d) {
  const ex = S.weights.find(w => w.d === d);
  modal(`<h3>${ex ? 'Eintrag bearbeiten' : 'Gewicht nachtragen'}</h3>
    <label class="l">Datum</label><input class="f" type="date" id="mD" value="${d || dkey()}" max="${dkey()}">
    <label class="l">Gewicht (kg)</label><input class="f" id="mK" inputmode="decimal" value="${ex ? fmtF(ex.kg) : ''}">`,
    [ex ? { l: 'Löschen', c: 'danger', f: () => { S.weights = S.weights.filter(w => w.d !== d); saveNow(); render(); } } : null,
     { l: 'Speichern', c: 'pri', f: () => {
       const nd = $('#mD').value, kg = num($('#mK').value);
       if (!nd || !(kg > 20 && kg < 400)) { toast('Bitte gültiges Gewicht eingeben'); return false; }
       S.weights = S.weights.filter(w => w.d !== nd && w.d !== d); S.weights.push({ d: nd, kg: Math.round(kg * 100) / 100 }); saveNow(); render();
     } }]);
}

// ---------- Deload ----------
function workoutDays() { return [...new Set(S.workouts.map(w => dkey(new Date(w.start))))].sort(); }
function deloadStatus() {
  const c = S.settings.cycle, today = dkey();
  let anchor = c.lastDeloadEnd && (!c.start || c.lastDeloadEnd > c.start) ? c.lastDeloadEnd : c.start;
  if (!anchor) return null;
  // Eine Trainingspause von mind. 8 Tagen zählt als Erholung: Zyklus beginnt neu
  let gapReset = false;
  const days = workoutDays().filter(d => d >= anchor);
  for (let i = 1; i < days.length; i++) if ((pdate(days[i]) - pdate(days[i - 1])) / DAY >= 8) { anchor = days[i]; gapReset = true; }
  const lastDay = days[days.length - 1];
  if (lastDay && (pdate(today) - pdate(lastDay)) / DAY >= 8) { anchor = today; gapReset = true; }
  const weeks = Math.floor((pdate(today) - pdate(anchor)) / DAY / 7);
  const interval = c.count === 0 && !c.lastDeloadEnd ? c.firstBlock : c.block;
  const dueIn = interval - weeks;
  const dueDate = dkey(new Date(+pdate(anchor) + interval * 7 * DAY));
  return { anchor, week: weeks + 1, interval, dueIn, dueDate, due: dueIn <= 0, gapReset, first: interval === c.firstBlock && c.count === 0 };
}
function setDeload(on) {
  const c = S.settings.cycle;
  S.settings.deloadOn = on;
  if (on) c.deloadStart = dkey();
  else { if (c.deloadStart) { c.count++; c.lastDeloadEnd = dkey(); } c.deloadStart = null; }
  if (S.active && !S.active.items.some(i => i.sets.some(s => s.done))) { applyDeloadToActive(on); }
  saveNow(); render();
}
function deloadCard() {
  const st = S.settings, c = st.cycle, ds = deloadStatus();
  let txt;
  if (st.deloadOn) {
    const days = c.deloadStart ? Math.floor((pdate(dkey()) - pdate(c.deloadStart)) / DAY) : 0;
    txt = `<b class="warn">Deload aktiv</b> <span class="mut small">seit ${days === 0 ? 'heute' : days + ' Tag' + (days === 1 ? '' : 'en')}</span>
      <div class="small mut" style="margin-top:4px">−${st.deload.setsPct}% Sätze · −${st.deload.repsPct}% Wdh. · −${st.deload.weightPct}% Gewicht</div>
      ${days >= 6 ? '<div class="small warn" style="margin-top:6px">Deload-Woche ist durch: Schalter aus und normal weiter.</div>' : ''}`;
  } else if (!ds) {
    txt = `<b>Deload</b><div class="small mut" style="margin-top:4px">Der Zyklus startet mit deinem ersten Training. Erster Deload empfohlen nach ${c.firstBlock} Wochen.</div>`;
  } else {
    txt = `<b>Deload</b> <span class="small mut">· Woche ${ds.week} von ${ds.interval}</span>
      <div class="small ${ds.due ? 'warn' : 'mut'}" style="margin-top:4px">${ds.due ? 'Jetzt empfohlen: diese Woche deloaden.' : `Nächster Deload in ${ds.dueIn} Woche${ds.dueIn === 1 ? '' : 'n'} (ab ${fdate(ds.dueDate, false)})`}</div>
      <div style="height:5px;background:var(--line);border-radius:3px;margin-top:8px;overflow:hidden"><div style="height:100%;width:${Math.min(100, (ds.week - 1) / ds.interval * 100 + 100 / ds.interval / 2)}%;background:${ds.due ? 'var(--warn)' : 'var(--acc)'}"></div></div>`;
  }
  return `<div class="${st.deloadOn || (ds && ds.due) ? 'banner' : 'card'}"><div class="row"><div class="grow">${txt}</div>
    <label class="switch w"><input type="checkbox" data-a="deload" ${st.deloadOn ? 'checked' : ''}><span></span></label></div>
    <button class="btn sm ghost" style="margin-top:10px" data-a="deloadinfo">Wie wird das berechnet?</button></div>`;
}
function viewDeloadInfo() {
  const d = S.settings.deload, c = S.settings.cycle;
  const h = `<div class="card">
    <h3>Deine Einstellung</h3>
    <p class="info">Erster Deload nach <b>${c.firstBlock} Wochen</b>, danach alle <b>${c.block} Wochen</b> (also ${c.block - 1} Wochen hart trainieren + 1 Woche Deload). In der Deload-Woche: <b>${d.setsPct}% weniger Arbeitssätze</b>, <b>${d.repsPct}% weniger Wiederholungen</b>, <b>${d.weightPct}% weniger Gewicht</b>. Aufwärmsätze bleiben gleich.</p>
    <p class="info">Die App rechnet das automatisch in dein Training ein: Gewichte werden auf ${fmt(S.settings.step)} kg gerundet, und Deload-Trainings zählen nicht als „letztes Mal“, damit nach der Woche wieder mit deinen normalen Gewichten vorgefüllt wird.</p>
  </div>
  <div class="card">
    <h3>Warum so?</h3>
    <p class="info"><b>Wie oft:</b> In der Praxis und laut einer Expertenbefragung (Bell et al., 2023) werden Deloads meist alle <b>4–8 Wochen</b> für etwa <b>1 Woche</b> eingeplant. 13 Wochen ist eher lang für jemanden, der hart trainiert.</p>
    <p class="info"><b>Wiedereinstieg nach 2 Jahren:</b> Dank Muscle Memory kommt Kraft schnell zurück, und weil du anfangs noch nicht mit deinen alten Maximalgewichten trainierst, ist die Ermüdung niedriger. Darum ist der erste Block etwas länger (${c.firstBlock} Wochen). Starte die ersten 2 Wochen mit ca. 60–70% deiner alten Gewichte und 3–4 Wiederholungen „im Tank“, damit Sehnen und Gelenke mitkommen.</p>
    <p class="info"><b>Was reduzieren:</b> Die Studienlage zeigt: Für einen Deload vor allem das <b>Volumen</b> runter (ca. 30–50% weniger Sätze/Wdh.), das Gewicht nur leicht senken. So erholst du dich, ohne Kraft zu verlieren. Ein komplettes Aussetzen bringt keinen Vorteil.</p>
    <p class="info"><b>Früher deloaden, wenn:</b> du 2 Einheiten hintereinander bei mehreren Übungen schwächer bist, Gelenke zwicken, du schlecht schläfst oder dauerhaft platt bist. Dann einfach den Schalter umlegen. Eine Woche Pause (Urlaub, krank) zählt automatisch als Erholung und startet den Zyklus neu.</p>
  </div>
  <h2>Anpassen</h2>
  <div class="card">
    <div class="grid2">
      <div><label class="l">Erster Block (Wochen)</label>${stepper('cycle.firstBlock', c.firstBlock, 1)}</div>
      <div><label class="l">Danach alle (Wochen)</label>${stepper('cycle.block', c.block, 1)}</div>
    </div>
    <div class="grid3">
      <div><label class="l">Sätze −%</label>${stepper('deload.setsPct', d.setsPct, 5)}</div>
      <div><label class="l">Wdh. −%</label>${stepper('deload.repsPct', d.repsPct, 5)}</div>
      <div><label class="l">Gewicht −%</label>${stepper('deload.weightPct', d.weightPct, 5)}</div>
    </div>
    <label class="l">Zyklus-Start (erstes Training)</label><input class="f" type="date" data-a="cyclestart" value="${c.start || ''}">
    <button class="btn ghost block" style="margin-top:12px" data-a="deloadreset">Standardwerte</button>
  </div>`;
  return ['Deload', h];
}
function stepper(path, val, step) {
  return `<div class="stepper"><button data-a="stp" data-id="${path}" data-s="${-step}">−</button><input inputmode="numeric" data-a="stpin" data-id="${path}" value="${val}"><button data-a="stp" data-id="${path}" data-s="${step}">+</button></div>`;
}
const STEP_LIMITS = { 'cycle.firstBlock': [2, 20], 'cycle.block': [2, 20], 'deload.setsPct': [0, 80], 'deload.repsPct': [0, 80], 'deload.weightPct': [0, 50], rest: [0, 900], warmRestSec: [0, 600], step: [0.25, 10] };
function setPath(path, v) {
  const [a, b] = path.split('.');
  const lim = STEP_LIMITS[path] || [0, 9999];
  v = Math.min(lim[1], Math.max(lim[0], v));
  if (b) S.settings[a][b] = v; else S.settings[a] = v;
  return v;
}
function getPath(path) { const [a, b] = path.split('.'); return b ? S.settings[a][b] : S.settings[a]; }

// ---------- Training: Pläne ----------
function lastDone(planId) { const w = S.workouts.filter(w => w.planId === planId).sort((a, b) => b.start - a.start)[0]; return w ? w.start : null; }
function viewTraining() {
  let h = '';
  if (S.active) {
    const done = S.active.items.reduce((a, i) => a + i.sets.filter(s => s.done).length, 0), tot = S.active.items.reduce((a, i) => a + i.sets.length, 0);
    h += `<div class="banner g tap" data-a="resume"><div class="row"><div class="grow"><b>Training läuft: ${esc(S.active.name)}</b><div class="small mut">${done}/${tot} Sätze · seit ${mmss((Date.now() - S.active.start) / 1000)} min</div></div><button class="btn pri sm">Weiter</button></div></div>`;
  }
  h += deloadCard();
  h += `<h2>Trainingspläne</h2>`;
  if (!S.plans.length) {
    h += `<div class="card"><p class="info" style="margin-top:0">Noch keine Pläne. Erstelle einen eigenen oder starte mit einer Vorlage und pass sie an.</p>
      <div class="chips">${Object.keys(TEMPLATES).map(k => `<button class="chip" data-a="tpl" data-id="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>`;
  }
  S.plans.forEach(p => {
    const ld = lastDone(p.id);
    h += `<div class="card"><div class="row"><div class="grow tap" data-a="editplan" data-id="${p.id}"><h3>${esc(p.name)}</h3>
      <div class="small mut">${p.items.length} Übungen${ld ? ' · zuletzt ' + fdate(ld, false) : ''}</div>
      <div class="tiny mut" style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.items.map(i => esc(exName(i.exId))).join(' · ')}</div></div>
      <button class="btn pri" data-a="start" data-id="${p.id}">Start</button></div></div>`;
  });
  h += `<div class="grid2"><button class="btn ghost" data-a="newplan">+ Neuer Plan</button><button class="btn ghost" data-a="start" data-id="">Freies Training</button></div>`;
  if (S.plans.length) h += `<div class="small mut" style="margin:12px 2px">Tipp: Plan antippen zum Bearbeiten.</div>`;
  return ['Training', h];
}
const TEMPLATES = {
  'Ganzkörper A/B': [['Ganzkörper A', [['Kniebeugen', 2, 3, '6-8', 180], ['Bankdrücken', 2, 3, '6-8', 150], ['Rudern vorgebeugt', 1, 3, '8-10', 120], ['Schulterdrücken', 1, 2, '8-10', 120], ['Bizepscurls', 0, 2, '10-12', 75]]],
    ['Ganzkörper B', [['Kreuzheben', 2, 3, '5-6', 180], ['Schrägbankdrücken KH', 1, 3, '8-10', 120], ['Latzug', 1, 3, '8-10', 120], ['Beinpresse', 1, 2, '10-12', 120], ['Trizepsdrücken Kabel', 0, 2, '10-12', 75]]]],
  'Oberkörper/Unterkörper': [['Oberkörper', [['Bankdrücken', 2, 3, '6-8', 150], ['Rudern Kabel', 1, 3, '8-10', 120], ['Schulterdrücken KH', 1, 3, '8-10', 120], ['Klimmzüge', 0, 3, '6-10', 120], ['Seitheben', 0, 3, '12-15', 60], ['Bizepscurls', 0, 2, '10-12', 75]]],
    ['Unterkörper', [['Kniebeugen', 2, 3, '6-8', 180], ['Rumänisches Kreuzheben', 1, 3, '8-10', 150], ['Beinpresse', 1, 3, '10-12', 120], ['Beinbeuger', 0, 3, '10-12', 90], ['Wadenheben', 0, 3, '12-15', 60]]]],
  'Push/Pull/Beine': [['Push', [['Bankdrücken', 2, 3, '6-8', 150], ['Schrägbankdrücken KH', 1, 3, '8-10', 120], ['Schulterdrücken', 1, 3, '8-10', 120], ['Seitheben', 0, 3, '12-15', 60], ['Trizepsdrücken Kabel', 0, 3, '10-12', 75]]],
    ['Pull', [['Klimmzüge', 1, 3, '6-10', 120], ['Rudern vorgebeugt', 1, 3, '8-10', 120], ['Latzug', 0, 3, '10-12', 90], ['Face Pulls', 0, 3, '12-15', 60], ['Bizepscurls', 0, 3, '10-12', 75]]],
    ['Beine', [['Kniebeugen', 2, 3, '6-8', 180], ['Rumänisches Kreuzheben', 1, 3, '8-10', 150], ['Beinpresse', 1, 3, '10-12', 120], ['Beinbeuger', 0, 3, '10-12', 90], ['Wadenheben', 0, 3, '12-15', 60]]]]
};
function newItem(exId, warm = 1, sets = 3, reps = '8-10', rest) {
  return { id: uid(), exId, warm, sets, reps, rest: rest ?? S.settings.rest, warmRest: S.settings.warmRest, warmRestSec: S.settings.warmRestSec };
}
function addTemplate(k) {
  TEMPLATES[k].forEach(([name, items]) => S.plans.push({ id: uid(), name, items: items.map(([n, w, s, r, rest]) => newItem(exByName(n).id, w, s, r, rest)) }));
  saveNow(); render(); toast('Vorlage hinzugefügt. Antippen zum Anpassen.');
}
function viewPlanEdit(id) {
  const p = S.plans.find(x => x.id === id);
  if (!p) { stack.pop(); return viewTraining(); }
  let h = `<label class="l">Name</label><input class="f" data-a="pname" value="${esc(p.name)}" placeholder="z.B. Push, Oberkörper A">`;
  h += `<datalist id="exlist">${S.exercises.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>`;
  p.items.forEach((it, i) => {
    h += `<div class="planitem" data-item="${it.id}">
      <div class="row"><span class="pill">${i + 1}</span><input class="f grow" list="exlist" data-a="iname" data-id="${it.id}" value="${esc(exName(it.exId))}" placeholder="Übung">
        <button class="iconbtn" data-a="iup" data-id="${it.id}" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button>
        <button class="iconbtn" data-a="idel" data-id="${it.id}">✕</button></div>
      <div class="grid3">
        <div><label class="l">Aufwärmsätze</label>${istep(it, 'warm', 1)}</div>
        <div><label class="l">Arbeitssätze</label>${istep(it, 'sets', 1)}</div>
        <div><label class="l">Wdh. (z.B. 8-10)</label><input class="f" style="text-align:center;font-weight:650" data-a="ireps" data-id="${it.id}" value="${esc(it.reps)}"></div>
      </div>
      <div class="grid2">
        <div><label class="l">Pause Arbeitssatz</label>${istep(it, 'rest', 15, true)}</div>
        <div><label class="l row between" style="display:flex">Pause Aufwärmen <label class="switch" style="transform:scale(.7);margin:-8px -8px -8px 0"><input type="checkbox" data-a="iwr" data-id="${it.id}" ${it.warmRest ? 'checked' : ''}><span></span></label></label>
          ${it.warmRest ? istep(it, 'warmRestSec', 15, true) : '<div class="stepper" style="justify-content:center;height:44px;color:var(--mut);font-size:13px">keine Pause</div>'}</div>
      </div>
      <label class="l">Notiz (dauerhaft, optional)</label><input class="f" data-a="inote" data-id="${it.id}" value="${esc(exNote(it.exId))}" placeholder="z.B. Sitz Stufe 4, enger Griff"></div>`;
  });
  h += `<button class="btn ghost block" data-a="iadd">+ Übung hinzufügen</button>
    <div class="grid2" style="margin-top:20px"><button class="btn ghost" data-a="pdup">Duplizieren</button><button class="btn danger" data-a="pdel">Plan löschen</button></div>
    <button class="btn pri block" style="margin-top:10px" data-a="start" data-id="${p.id}">Training starten</button>`;
  return [p.name || 'Neuer Plan', h, ''];
}
function istep(it, f, step, time) {
  return `<div class="stepper"><button data-a="ist" data-id="${it.id}" data-f="${f}" data-s="${-step}">−</button><input readonly value="${time ? mmss(it[f]) : it[f]}"><button data-a="ist" data-id="${it.id}" data-f="${f}" data-s="${step}">+</button></div>`;
}
function curPlan() { const t = topView(); return S.plans.find(p => p.id === t.id); }

// ---------- Training: Session ----------
/** Letzte Sätze einer Übung aus dem letzten normalen (nicht Deload) Training */
function lastSets(exId, includeDeload) {
  const ws = S.workouts.filter(w => includeDeload || !w.deload).sort((a, b) => b.start - a.start);
  for (const w of ws) { const it = w.items.find(i => i.exId === exId); if (it && it.sets.length) return { w, warm: it.sets.filter(s => s.t === 'w'), work: it.sets.filter(s => s.t !== 'w') }; }
  if (!includeDeload) return lastSets(exId, true);
  return null;
}
function buildWorkSets(pi, deload, count) {
  const base = lastSets(pi.exId), d = S.settings.deload, step = S.settings.step;
  const [rmin] = repRange(pi.reps);
  const n = count != null ? count : (deload ? Math.max(1, Math.round(pi.sets * (1 - d.setsPct / 100))) : pi.sets);
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = base && (base.work[i] || base.work[base.work.length - 1]);
    let kg = b ? num(b.kg) : NaN, reps = b ? num(b.reps) : rmin;
    if (base && base.w.deload && !deload) { /* Basis war Deload: wieder hochrechnen */ kg = isFinite(kg) ? roundStep(kg / (1 - d.weightPct / 100), step) : kg; reps = Math.max(reps, rmin); }
    if (deload && !(base && base.w.deload)) { if (isFinite(kg)) kg = roundStep(kg * (1 - d.weightPct / 100), step); reps = Math.max(1, Math.round(reps * (1 - d.repsPct / 100))); }
    out.push({ t: 'n', kg: isFinite(kg) ? kg : '', reps: isFinite(reps) ? reps : '', done: false });
  }
  return out;
}
function buildItem(pi, deload) {
  const base = lastSets(pi.exId);
  const sets = [];
  for (let i = 0; i < pi.warm; i++) { const b = base && (base.warm[i] || base.warm[base.warm.length - 1]); sets.push({ t: 'w', kg: b ? b.kg : '', reps: b ? b.reps : '', done: false }); }
  sets.push(...buildWorkSets(pi, deload));
  return { exId: pi.exId, reps: pi.reps, plannedSets: pi.sets, rest: pi.rest, warmRest: pi.warmRest, warmRestSec: pi.warmRestSec, sets };
}
function applyDeloadToActive(on) {
  const a = S.active; if (!a) return;
  a.deload = on;
  a.items.forEach(it => {
    const doneWork = it.sets.filter(s => s.t !== 'w' && s.done).length;
    const pi = { exId: it.exId, reps: it.reps, sets: it.plannedSets || it.sets.filter(s => s.t !== 'w').length };
    const target = on ? Math.max(1, Math.round(pi.sets * (1 - S.settings.deload.setsPct / 100))) : pi.sets;
    const fresh = buildWorkSets(pi, on, Math.max(0, target));
    it.sets = it.sets.filter(s => s.t === 'w' || s.done).concat(fresh.slice(doneWork));
  });
}
function startWorkout(planId) {
  if (S.active) { toast('Es läuft schon ein Training'); go('session'); return; }
  const p = S.plans.find(x => x.id === planId);
  const deload = S.settings.deloadOn;
  if (!S.settings.cycle.start) S.settings.cycle.start = dkey();
  S.active = { id: uid(), planId: p ? p.id : null, name: p ? p.name : 'Freies Training', start: Date.now(), deload, items: p ? p.items.map(pi => buildItem(pi, deload)) : [], timer: null };
  saveNow();
  keepAwake(true);
  go('session');
}
function keepAwake(on) { try { if (NATIVE) Android.keepScreenOn(on && S.settings.keepAwake); } catch (e) {} }
const setTxt = s => `${fmt(num(s.kg)) || 0}×${s.reps}${s.rir !== '' && s.rir != null ? ' @' + s.rir : ''}`;
const exNote = id => (S.exercises.find(e => e.id === id) || {}).note || '';
function lastNote(exId) { const ws = S.workouts.slice().sort((a, b) => b.start - a.start); for (const w of ws) { const it = w.items.find(i => i.exId === exId); if (it) return it.note ? { w, note: it.note } : null; } return null; }
function prevText(exId) {
  const b = lastSets(exId, true); if (!b) return 'Erstes Mal: trag Gewicht und Wdh. ein';
  return `Zuletzt ${fdate(b.w.start, false)}${b.w.deload ? ' (Deload)' : ''}: ` + b.work.map(setTxt).join(' · ');
}
function suggestion(it, idx) {
  if (S.active.deload) return '';
  const b = lastSets(it.exId); if (!b || b.w.deload || !b.work.length) return '';
  const [rmin, rmax] = repRange(it.reps);
  if (b.work.length >= (it.plannedSets || 1) && b.work.every(s => num(s.reps) >= rmax) && it.sets.every(s => !s.done || s.t === 'w')) {
    const kg = num(b.work[0].kg);
    if (!(kg > 0)) return '';
    const cur = it.sets.find(s => s.t !== 'w');
    if (cur && num(cur.kg) > kg) return '';
    return `<button class="suggest" data-a="sugg" data-id="${idx}">↑ Letztes Mal alle ${rmax}+ Wdh. geschafft: +${fmt(S.settings.step)} kg und ${rmin} Wdh.?</button>`;
  }
  return '';
}
function viewSession() {
  const a = S.active;
  if (!a) { stack.pop(); return viewTraining(); }
  let h = `<div class="row between small" style="margin:2px 2px 6px"><span class="mut">${fdate(a.start)} · <span id="elapsed">${mmss((Date.now() - a.start) / 1000)}</span></span>
    <label class="row" style="gap:8px"><span class="${a.deload ? 'warn' : 'mut'}">Deload</span><label class="switch w" style="transform:scale(.8)"><input type="checkbox" data-a="sdeload" ${a.deload ? 'checked' : ''}><span></span></label></label></div>`;
  if (a.deload) h += `<div class="banner small" style="padding:10px 12px">Deload-Training: weniger Sätze, Wdh. und Gewicht sind schon eingerechnet. Locker bleiben, 3–4 Wdh. im Tank.</div>`;
  const rirOn = S.settings.rir;
  a.items.forEach((it, idx) => {
    let wn = 0, nn = 0;
    h += `<div class="ex"><div class="row"><h3 class="grow">${esc(exName(it.exId))}</h3><span class="small mut">${esc(it.reps)} Wdh · ${mmss(it.rest)}</span><button class="iconbtn" data-a="exmenu" data-id="${idx}">⋯</button></div>
      <div class="hint">${esc(prevText(it.exId))}</div>${notesHtml(it)}${suggestion(it, idx)}
      <table class="sets"><tr><th style="width:42px">Satz</th><th>kg</th><th>Wdh.</th>${rirOn ? '<th style="width:58px" data-a="ririnfo">RIR ⓘ</th>' : ''}<th style="width:50px"></th></tr>`;
    it.sets.forEach((s, si) => {
      const lab = s.t === 'w' ? 'W' + (++wn > 1 ? wn : '') : ++nn;
      h += `<tr class="${s.t === 'w' ? 'w' : ''} ${s.done ? 'done' : ''}"><td><button class="badge" data-a="stype" data-id="${idx}" data-s="${si}">${lab}</button></td>
        <td><input inputmode="decimal" data-a="skg" data-id="${idx}" data-s="${si}" value="${s.kg === '' ? '' : fmt(num(s.kg), 2)}" placeholder="0"></td>
        <td><input inputmode="numeric" data-a="sreps" data-id="${idx}" data-s="${si}" value="${s.reps}" placeholder="0"></td>
        ${rirOn ? (s.t === 'w' ? '<td></td>' : `<td><input class="rir" inputmode="numeric" maxlength="2" data-a="srir" data-id="${idx}" data-s="${si}" value="${s.rir ?? ''}" placeholder="–"></td>`) : ''}
        <td><button class="chk" data-a="sdone" data-id="${idx}" data-s="${si}">✓</button></td></tr>`;
    });
    h += `</table><div class="row" style="margin-top:8px;gap:6px"><button class="btn sm ghost" data-a="sadd" data-id="${idx}">+ Satz</button><button class="btn sm ghost" data-a="swadd" data-id="${idx}">+ Aufwärmen</button><button class="btn sm ghost" data-a="snote" data-id="${idx}">Notiz</button><span class="grow"></span><button class="btn sm ghost" data-a="srem" data-id="${idx}">− Satz</button></div></div>`;
  });
  h += `<button class="btn ghost block" data-a="sexadd">+ Übung hinzufügen</button>
    <button class="btn pri block" style="margin-top:14px" data-a="finish">Training beenden</button>
    <button class="btn danger block" style="margin-top:10px" data-a="discard">Training verwerfen</button><div style="height:30px"></div>`;
  return [a.name, h, ''];
}
function notesHtml(it) {
  let h = '';
  const n = exNote(it.exId); if (n) h += `<div class="note tap" data-a="snote" data-id="${S.active.items.indexOf(it)}">📌 ${esc(n)}</div>`;
  if (it.note) h += `<div class="note tap" data-a="snote" data-id="${S.active.items.indexOf(it)}">📝 Heute: ${esc(it.note)}</div>`;
  else { const l = lastNote(it.exId); if (l) h += `<div class="note mut">📝 ${fdate(l.w.start, false)}: ${esc(l.note)}</div>`; }
  return h;
}
function finishWorkout() {
  const a = S.active;
  const undone = a.items.reduce((n, i) => n + i.sets.filter(s => !s.done && (num(s.reps) > 0)).length, 0);
  const doFinish = includeUndone => {
    const items = a.items.map(i => { const o = { exId: i.exId, sets: i.sets.filter(s => (s.done || includeUndone) && num(s.reps) > 0).map(s => { const r = { t: s.t, kg: isFinite(num(s.kg)) ? num(s.kg) : 0, reps: num(s.reps) }; if (s.t !== 'w' && isFinite(num(s.rir))) r.rir = num(s.rir); return r; }) }; if (i.note) o.note = i.note; return o; }).filter(i => i.sets.length);
    if (!items.length) { toast('Keine Sätze erledigt. Training verworfen.'); S.active = null; stopTimer(); keepAwake(false); saveNow(); stack = []; tab = 'training'; render(true); return; }
    const prs = items.map(i => { const before = bestE1rm(i.exId); const now = Math.max(...i.sets.filter(s => s.t !== 'w').map(s => e1rm(s.kg, s.reps)), 0); return before > 0 && now > before ? exName(i.exId) : null; }).filter(Boolean);
    const w = { id: a.id, planId: a.planId, name: a.name, start: a.start, end: Date.now(), deload: a.deload, items };
    S.workouts.push(w); S.active = null; stopTimer(); keepAwake(false); saveNow();
    stack = []; tab = 'training'; render(true);
    const vol = items.reduce((t, i) => t + i.sets.filter(s => s.t !== 'w').reduce((x, s) => x + s.kg * s.reps, 0), 0);
    const sets = items.reduce((t, i) => t + i.sets.filter(s => s.t !== 'w').length, 0);
    modal(`<h3>Stark! 💪 Training gespeichert</h3>
      <div class="kv"><span class="mut">Dauer</span><b>${Math.round((w.end - w.start) / 60000)} min</b></div>
      <div class="kv"><span class="mut">Arbeitssätze</span><b>${sets}</b></div>
      <div class="kv"><span class="mut">Volumen</span><b>${fmt(vol, 0)} kg</b></div>
      ${prs.length ? `<div class="banner g small" style="margin-top:10px">🏆 Neuer Rekord (geschätztes 1RM): <b>${prs.map(esc).join(', ')}</b></div>` : ''}`, [{ l: 'Fertig', c: 'pri' }]);
  };
  if (undone > 0) modal(`<h3>Training beenden?</h3><p class="info">${undone} Satz/Sätze ${undone === 1 ? 'ist' : 'sind'} nicht abgehakt.</p>`,
    [{ l: 'Nur abgehakte', f: () => doFinish(false) }, { l: 'Alle speichern', c: 'pri', f: () => doFinish(true) }]);
  else modal('<h3>Training beenden?</h3>', [{ l: 'Abbrechen' }, { l: 'Beenden', c: 'pri', f: () => doFinish(false) }]);
}
function bestE1rm(exId) { let b = 0; S.workouts.forEach(w => w.items.forEach(i => { if (i.exId === exId) i.sets.forEach(s => { if (s.t !== 'w') b = Math.max(b, e1rm(s.kg, s.reps)); }); })); return b; }
function pickExercise(cb) {
  modal(`<h3>Übung hinzufügen</h3><input class="f" id="mEx" list="exlist2" placeholder="Name eingeben oder wählen">
    <datalist id="exlist2">${S.exercises.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
    <div class="chips" style="margin-top:10px">${S.exercises.slice(-12).reverse().map(e => `<button class="chip" data-a="mexpick" data-id="${esc(e.name)}">${esc(e.name)}</button>`).join('')}</div>`,
    [{ l: 'Abbrechen' }, { l: 'Hinzufügen', c: 'pri', f: () => { const e = exByName($('#mEx').value); if (!e) { toast('Name fehlt'); return false; } cb(e); } }]);
  setTimeout(() => $('#mEx') && $('#mEx').focus(), 50);
}

// ---------- Pausentimer ----------
let tickI = null;
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
  const el = $('#timer'); const t = S && S.active && S.active.timer;
  const show = t && topView() && topView().v === 'session';
  if (!show) { el.classList.add('hidden'); return; }
  const left = (t.end - Date.now()) / 1000;
  if (left <= 0) {
    if (!t.fired) { t.fired = true; vib(400); beep(); saveSoon(); }
    if (left < -8) { S.active.timer = null; el.classList.add('hidden'); return; }
    el.className = 'end'; el.innerHTML = `<div class="t acc">Los!</div><div class="grow small">Pause vorbei, nächster Satz</div><button data-a="tskip">OK</button>`;
    return;
  }
  el.className = '';
  el.innerHTML = `<div class="t">${mmss(left)}</div><div class="grow small mut">Pause</div><button data-a="tadj" data-id="-15">−15</button><button data-a="tadj" data-id="15">+15</button><button data-a="tskip">Skip</button><div class="bar" style="width:${(1 - left / t.total) * 100}%"></div>`;
}
setInterval(() => { if (S && S.active) { renderTimer(); const e = $('#elapsed'); if (e) e.textContent = mmss((Date.now() - S.active.start) / 1000); } }, 250);
window.onAppResume = () => { if (S) renderTimer(); };

// ---------- Verlauf ----------
function viewHistory() {
  let h = `<div class="seg"><button class="${ui.histSeg === 'workouts' ? 'on' : ''}" data-a="hseg" data-id="workouts">Trainings</button><button class="${ui.histSeg === 'exercises' ? 'on' : ''}" data-a="hseg" data-id="exercises">Übungen</button></div>`;
  if (ui.histSeg === 'workouts') {
    const ws = S.workouts.slice().sort((a, b) => b.start - a.start);
    if (!ws.length) return ['Verlauf', h + '<div class="empty">Noch keine Trainings gespeichert.</div>'];
    // Wochenübersicht
    const wk = {}; ws.forEach(w => { const k = monday(dkey(new Date(w.start))); wk[k] = (wk[k] || 0) + 1; });
    const thisW = wk[monday(dkey())] || 0;
    h += `<div class="grid2"><div class="card" style="margin:6px 0 0"><div class="mut small">Diese Woche</div><div class="mid">${thisW} <span class="small mut">Trainings</span></div></div>
      <div class="card" style="margin:6px 0 0"><div class="mut small">Insgesamt</div><div class="mid">${ws.length} <span class="small mut">Trainings</span></div></div></div>`;
    let lastWk = '';
    ws.forEach(w => {
      const k = monday(dkey(new Date(w.start)));
      if (k !== lastWk) { h += `<h2 class="small mut" style="font-size:13px">KW ${isoWeek(k)} · ${fdate(k, false)}</h2>`; lastWk = k; }
      const sets = w.items.reduce((t, i) => t + i.sets.filter(s => s.t !== 'w').length, 0);
      h += `<div class="card tap" data-a="wdetail" data-id="${w.id}"><div class="row"><div class="grow"><b>${esc(w.name)}</b> ${w.deload ? '<span class="pill d">Deload</span>' : ''}
        <div class="small mut">${fdate(w.start)} · ${Math.round((w.end - w.start) / 60000)} min · ${sets} Sätze</div></div><span class="mut">›</span></div></div>`;
    });
  } else {
    const used = S.exercises.filter(e => S.workouts.some(w => w.items.some(i => i.exId === e.id)));
    if (!used.length) return ['Verlauf', h + '<div class="empty">Sobald du trainiert hast, siehst du hier die Entwicklung jeder Übung.</div>'];
    h += '<div class="card list">';
    used.sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach(e => {
      const pts = exSeries(e.id); const last = pts[pts.length - 1];
      h += `<div class="it tap" data-a="exdetail" data-id="${e.id}"><div class="grow"><b>${esc(e.name)}</b><div class="small mut">${pts.length}× · zuletzt ${fmt(last.top.kg)} kg × ${last.top.reps}</div></div><span class="mut">›</span></div>`;
    });
    h += '</div>';
  }
  return ['Verlauf', h];
}
function exSeries(exId) {
  const out = [];
  S.workouts.slice().sort((a, b) => a.start - b.start).forEach(w => {
    w.items.filter(i => i.exId === exId).forEach(i => {
      const work = i.sets.filter(s => s.t !== 'w'); if (!work.length) return;
      let top = work[0]; work.forEach(s => { if (s.kg > top.kg || (s.kg === top.kg && s.reps > top.reps)) top = s; });
      out.push({ w, top, e1rm: Math.max(...work.map(s => e1rm(s.kg, s.reps))), vol: work.reduce((t, s) => t + s.kg * s.reps, 0), reps: work.reduce((t, s) => t + s.reps, 0), work });
    });
  });
  return out;
}
function viewExercise(id) {
  const pts = exSeries(id);
  const metrics = { e1rm: ['Geschätztes 1RM', p => p.e1rm, 'kg'], top: ['Top-Gewicht', p => p.top.kg, 'kg'], vol: ['Volumen', p => p.vol, 'kg'], reps: ['Wdh. gesamt', p => p.reps, ''] };
  const [mlab, mf, unit] = metrics[ui.exMetric];
  const best = pts.reduce((b, p) => p.e1rm > (b ? b.e1rm : 0) ? p : b, null);
  const bestKg = pts.reduce((b, p) => Math.max(b, p.top.kg), 0);
  let h = '';
  if (pts.length) {
    const first = pts.find(p => !p.w.deload) || pts[0], last = pts.filter(p => !p.w.deload).pop() || pts[pts.length - 1];
    const diff = mf(last) - mf(first);
    h += `<div class="grid2"><div class="card" style="margin:6px 0 0"><div class="mut small">Bestes 1RM (geschätzt)</div><div class="mid">${fmt(best.e1rm)} <span class="small mut">kg</span></div><div class="tiny mut">${fmt(best.top.kg)} kg × ${best.top.reps} · ${fdate(best.w.start, false)}</div></div>
      <div class="card" style="margin:6px 0 0"><div class="mut small">Schwerstes Gewicht</div><div class="mid">${fmt(bestKg)} <span class="small mut">kg</span></div><div class="tiny mut">${pts.length} Training${pts.length === 1 ? '' : 's'}</div></div></div>`;
    h += `<div class="card"><div class="chips">${Object.keys(metrics).map(k => `<button class="chip ${ui.exMetric === k ? 'on' : ''}" data-a="exmetric" data-id="${k}">${metrics[k][0]}</button>`).join('')}</div>
      ${chartBox('ex', { h: 200, minPad: 1, series: [{ pts: pts.map(p => ({ x: p.w.start, y: mf(p), hollow: p.w.deload, label: `${fdate(p.w.start, false)}: <b>${fmt(mf(p))} ${unit}</b>${p.w.deload ? ' (Deload)' : ''}` })), color: '#7CF29C', line: true, dots: true, r: 3.5 }] })}
      <div class="small mut" style="margin-top:6px">${mlab}: ${diff >= 0 ? '+' : ''}${fmt(diff)} ${unit} seit ${fdate(first.w.start, false)} · ○ = Deload</div></div>`;
  }
  h += '<h2>Alle Einheiten</h2><div class="card list">';
  pts.slice().reverse().forEach(p => {
    h += `<div class="it tap" data-a="wdetail" data-id="${p.w.id}"><div class="grow"><div class="small"><b>${fdate(p.w.start)}</b> ${p.w.deload ? '<span class="pill d">Deload</span>' : ''}</div>
      <div class="small mut">${p.work.map(setTxt).join(' · ')}</div></div><div class="small mut">${fmt(p.e1rm, 0)}</div></div>`;
  });
  h += '</div>';
  return [exName(id), h, `<button class="btn sm ghost" data-a="exrename" data-id="${id}">Umbenennen</button>`];
}
function viewWorkoutDetail(id) {
  const w = S.workouts.find(x => x.id === id);
  if (!w) { stack.pop(); return viewHistory(); }
  let h = `<div class="small mut" style="margin:4px 2px">${fdate(w.start)} · ${new Date(w.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${Math.round((w.end - w.start) / 60000)} min ${w.deload ? '<span class="pill d">Deload</span>' : ''}</div>`;
  w.items.forEach((it, ii) => {
    let wn = 0, nn = 0;
    h += `<div class="ex"><h3 class="tap" data-a="exdetail" data-id="${it.exId}">${esc(exName(it.exId))} <span class="mut">›</span></h3>${exNote(it.exId) ? `<div class="note">📌 ${esc(exNote(it.exId))}</div>` : ''}${it.note ? `<div class="note">📝 ${esc(it.note)}</div>` : ''}<table class="sets"><tr><th style="width:42px">Satz</th><th>kg</th><th>Wdh.</th><th style="width:58px">RIR</th><th style="width:44px">1RM≈</th></tr>`;
    it.sets.forEach((s, si) => {
      h += `<tr class="${s.t === 'w' ? 'w' : ''}"><td><span class="badge">${s.t === 'w' ? 'W' : ++nn}</span></td>
        <td><input inputmode="decimal" data-a="hkg" data-id="${w.id}" data-i="${ii}" data-s="${si}" value="${fmt(s.kg, 2)}"></td>
        <td><input inputmode="numeric" data-a="hreps" data-id="${w.id}" data-i="${ii}" data-s="${si}" value="${s.reps}"></td>
        <td>${s.t === 'w' ? '' : `<input class="rir" inputmode="numeric" data-a="hrir" data-id="${w.id}" data-i="${ii}" data-s="${si}" value="${s.rir ?? ''}" placeholder="–">`}</td>
        <td class="small mut">${s.t === 'w' ? '' : fmt(e1rm(s.kg, s.reps), 0)}</td></tr>`;
    });
    h += '</table></div>';
  });
  h += `<div class="small mut" style="margin:6px 2px">Werte kannst du hier direkt korrigieren.</div><button class="btn danger block" style="margin-top:14px" data-a="wdel" data-id="${w.id}">Training löschen</button>`;
  return [w.name, h];
}

// ---------- Einstellungen / Daten ----------
function viewSettings() {
  const s = S.settings;
  let bi = '';
  if (NATIVE) { try { bi = Android.backupInfo(); } catch (e) {} }
  const [bname, blast] = bi ? bi.split('|') : ['', 0];
  const sw = (k, label, sub) => `<div class="it"><div class="grow">${label}${sub ? `<div class="small mut">${sub}</div>` : ''}</div><label class="switch"><input type="checkbox" data-a="sset" data-id="${k}" ${s[k] ? 'checked' : ''}><span></span></label></div>`;
  let h = `<h2>Pausentimer</h2><div class="card">
    <div class="grid2"><div><label class="l">Standard Arbeitssatz</label>${tstep('rest', s.rest)}</div><div><label class="l">Standard Aufwärmen</label>${tstep('warmRestSec', s.warmRestSec)}</div></div>
    <div class="list" style="margin-top:6px">${sw('warmRest', 'Pause nach Aufwärmsätzen', 'Standard für neue Übungen')}${sw('vibrate', 'Vibration')}${sw('sound', 'Ton')}${sw('keepAwake', 'Bildschirm im Training anlassen')}${sw('rir', 'RIR erfassen', 'Spalte für Wiederholungen im Tank')}</div>
    <div class="small mut">Pausen pro Übung stellst du im Plan ein.</div></div>
  <h2>Training</h2><div class="card"><label class="l">Gewichtsschritte (für Vorschläge & Deload-Rundung)</label>
    <div class="chips">${[1, 1.25, 2, 2.5, 5].map(v => `<button class="chip ${s.step === v ? 'on' : ''}" data-a="stepkg" data-id="${v}">${fmt(v, 2)} kg</button>`).join('')}</div>
    <button class="btn ghost block" style="margin-top:12px" data-a="deloadinfo">Deload-Einstellungen</button></div>
  <h2>Daten & Sicherung</h2><div class="card">
    <p class="info" style="margin-top:0">Alles wird dauerhaft auf deinem Handy gespeichert (${S.weights.length} Gewichtseinträge, ${S.workouts.length} Trainings) und zusätzlich über das Android-Backup in deinem Google-Konto gesichert.</p>`;
  if (NATIVE) h += `<p class="info"><b>Auto-Sicherung in Ordner:</b> ${bname ? `<span class="acc">${esc(bname)}</span><br><span class="small mut">Zuletzt: ${+blast ? new Date(+blast).toLocaleString('de-DE') : 'noch nicht'}</span>` : '<span class="warn">nicht eingerichtet</span>'}</p>
    <p class="small mut">Wähle einen Ordner (z.B. „Documents“ oder einen Google-Drive-Ordner). Nach jeder Änderung wird dort <b>GymLog-Backup.json</b> aktualisiert. Die Datei bleibt auch erhalten, wenn die App gelöscht wird.</p>
    <button class="btn ${bname ? 'ghost' : 'pri'} block" data-a="pickfolder">${bname ? 'Ordner ändern' : 'Sicherungsordner wählen'}</button>`;
  h += `<div class="grid2" style="margin-top:8px"><button class="btn ghost" data-a="export">Exportieren</button><button class="btn ghost" data-a="import">Importieren</button></div>
    <div class="small mut" style="margin-top:8px">Import ersetzt alle aktuellen Daten durch die der Datei.</div></div>
  <div class="small mut" style="text-align:center;margin:24px 0 8px">GymLog 1.1</div>`;
  return ['Einstellungen', h];
}
function tstep(k, v) { return `<div class="stepper"><button data-a="tst" data-id="${k}" data-s="-15">−</button><input readonly value="${mmss(v)}"><button data-a="tst" data-id="${k}" data-s="15">+</button></div>`; }
function exportData() {
  const txt = JSON.stringify(S, null, 1), name = `GymLog-${dkey()}.json`;
  if (NATIVE) { Android.exportFile(txt, name); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click();
}
window.onImport = text => {
  let d; try { d = JSON.parse(text); } catch (e) { toast('Datei ist kein gültiges Backup'); return; }
  if (!d || !Array.isArray(d.weights) || !Array.isArray(d.workouts)) { toast('Datei ist kein GymLog-Backup'); return; }
  modal(`<h3>Backup importieren?</h3><p class="info">${d.weights.length} Gewichtseinträge, ${d.workouts.length} Trainings, ${(d.plans || []).length} Pläne. Deine aktuellen Daten werden ersetzt.</p>`,
    [{ l: 'Abbrechen' }, { l: 'Importieren', c: 'pri', f: () => { S = merge(DEFAULTS(), d); saveNow(); stack = []; render(true); toast('Import erfolgreich'); } }]);
};
window.onNative = ev => {
  const m = { exported: 'Export gespeichert', exportError: 'Export fehlgeschlagen', importError: 'Datei konnte nicht gelesen werden', folderSet: 'Sicherungsordner eingerichtet', folderError: 'Ordner konnte nicht gesetzt werden' };
  toast(m[ev] || ev);
  if (ev === 'folderSet') { saveNow(); setTimeout(render, 800); }
};
$('#fileIn').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(window.onImport); e.target.value = ''; });

// ---------- Modal ----------
let modalBtns = [], modalGen = 0;
function modal(html, btns) {
  modalGen++;
  modalBtns = (btns || []).filter(Boolean);
  const m = $('#modal');
  m.innerHTML = `<div class="sheet">${html}<div class="btns">${modalBtns.map((b, i) => `<button class="btn ${b.c || ''}" data-a="mbtn" data-id="${i}">${esc(b.l)}</button>`).join('')}</div></div>`;
  m.classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// ---------- Aktionen ----------
const A = {
  back: () => back(),
  tab: el => setTab(el.dataset.id),
  mbtn: el => { const b = modalBtns[+el.dataset.id], g = modalGen; const r = b && b.f ? b.f() : undefined; if (r !== false && g === modalGen) closeModal(); },
  // Gewicht
  wstep: el => { const i = $('#wIn'); const v = (num(i.value) || 0) + parseFloat(el.dataset.id); i.value = fmtF(Math.max(0, v)); },
  wsave: () => {
    const kg = num($('#wIn').value);
    if (!(kg > 20 && kg < 400)) { toast('Bitte gültiges Gewicht eingeben'); return; }
    const d = dkey(); S.weights = S.weights.filter(w => w.d !== d); S.weights.push({ d, kg: Math.round(kg * 100) / 100 });
    saveNow(); render(); toast('Gespeichert: ' + fmtF(kg) + ' kg');
  },
  wrange: el => { ui.wRange = el.dataset.id; render(); },
  wlist: () => go('weights'),
  wadd: () => weightDialog(null),
  wedit: el => weightDialog(el.dataset.id),
  // Deload
  deload: el => setDeload(el.checked),
  deloadinfo: () => go('deloadinfo'),
  stp: el => { const p = el.dataset.id; setPath(p, (+getPath(p) || 0) + (+el.dataset.s)); saveNow(); render(); },
  deloadreset: () => { const d = DEFAULTS().settings; S.settings.deload = d.deload; S.settings.cycle.firstBlock = d.cycle.firstBlock; S.settings.cycle.block = d.cycle.block; saveNow(); render(); },
  // Pläne
  tpl: el => addTemplate(el.dataset.id),
  newplan: () => { const p = { id: uid(), name: '', items: [] }; S.plans.push(p); saveNow(); go('plan', p.id); setTimeout(() => { const i = document.querySelector('[data-a=pname]'); i && i.focus(); }, 50); },
  editplan: el => go('plan', el.dataset.id),
  iadd: () => { pickExercise(e => { curPlan().items.push(newItem(e.id)); saveNow(); render(); }); },
  idel: el => { const p = curPlan(); p.items = p.items.filter(i => i.id !== el.dataset.id); saveNow(); render(); },
  iup: el => { const p = curPlan(), i = p.items.findIndex(x => x.id === el.dataset.id); if (i > 0) { [p.items[i - 1], p.items[i]] = [p.items[i], p.items[i - 1]]; saveNow(); render(); } },
  ist: el => { const it = curPlan().items.find(i => i.id === el.dataset.id), f = el.dataset.f; const lim = { warm: [0, 6], sets: [1, 10], rest: [0, 600], warmRestSec: [0, 300] }[f]; it[f] = Math.min(lim[1], Math.max(lim[0], it[f] + (+el.dataset.s))); saveNow(); render(); },
  iwr: el => { curPlan().items.find(i => i.id === el.dataset.id).warmRest = el.checked; saveNow(); render(); },
  pdup: () => { const p = curPlan(); const c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.name = p.name + ' (Kopie)'; c.items.forEach(i => i.id = uid()); S.plans.push(c); saveNow(); stack.pop(); go('plan', c.id); toast('Plan dupliziert'); },
  pdel: () => { const p = curPlan(); modal(`<h3>„${esc(p.name || 'Plan')}“ löschen?</h3><p class="info">Deine bisherigen Trainings und der Verlauf bleiben erhalten.</p>`, [{ l: 'Abbrechen' }, { l: 'Löschen', c: 'danger', f: () => { S.plans = S.plans.filter(x => x.id !== p.id); saveNow(); stack.pop(); render(true); } }]); },
  start: el => startWorkout(el.dataset.id),
  resume: () => go('session'),
  // Session
  sdeload: el => { applyDeloadToActive(el.checked); saveNow(); render(); },
  sdone: el => {
    const it = S.active.items[+el.dataset.id], s = it.sets[+el.dataset.s];
    s.done = !s.done;
    if (s.done) {
      if (s.reps === '' || !(num(s.reps) > 0)) { s.done = false; toast('Erst Wdh. eintragen'); return; }
      const sec = s.t === 'w' ? (it.warmRest ? it.warmRestSec : 0) : it.rest;
      const isLast = S.active.items.every(i => i.sets.every(x => x.done));
      if (sec > 0 && !isLast) startTimer(sec); else stopTimer();
      // nächste offene Zeile mit gleichen Werten vorbefüllen, falls leer
      const nx = it.sets.find((x, i) => i > +el.dataset.s && !x.done && x.t === s.t);
      if (nx && nx.kg === '') nx.kg = s.kg;
    }
    saveNow(); render();
  },
  stype: el => { const s = S.active.items[+el.dataset.id].sets[+el.dataset.s]; s.t = s.t === 'w' ? 'n' : 'w'; saveNow(); render(); },
  sadd: el => { const it = S.active.items[+el.dataset.id]; const l = it.sets.filter(s => s.t !== 'w').pop() || it.sets[it.sets.length - 1]; it.sets.push({ t: 'n', kg: l ? l.kg : '', reps: l ? l.reps : repRange(it.reps)[0], done: false }); saveNow(); render(); },
  swadd: el => { const it = S.active.items[+el.dataset.id]; const n = it.sets.filter(s => s.t === 'w').length; const f = it.sets.find(s => s.t !== 'w'); it.sets.splice(n, 0, { t: 'w', kg: f && isFinite(num(f.kg)) ? roundStep(num(f.kg) * 0.5, S.settings.step) : '', reps: 8, done: false }); saveNow(); render(); },
  srem: el => { const it = S.active.items[+el.dataset.id]; let i = it.sets.length - 1; while (i >= 0 && it.sets[i].done) i--; if (i >= 0) it.sets.splice(i, 1); else toast('Nur offene Sätze können entfernt werden'); saveNow(); render(); },
  sugg: el => { const it = S.active.items[+el.dataset.id]; const b = lastSets(it.exId); let i = 0; it.sets.forEach(s => { if (s.t !== 'w' && !s.done) { const bs = b.work[i] || b.work[b.work.length - 1]; s.kg = num(bs.kg) + S.settings.step; s.reps = repRange(it.reps)[0]; i++; } }); saveNow(); render(); toast('+' + fmt(S.settings.step) + ' kg übernommen'); },
  exmenu: el => {
    const idx = +el.dataset.id, it = S.active.items[idx];
    modal(`<h3>${esc(exName(it.exId))}</h3><label class="l">Pause Arbeitssatz</label>${tstepS(idx, 'rest', it.rest)}<label class="l">Pause Aufwärmen (0 = keine)</label>${tstepS(idx, 'warmRestSec', it.warmRest ? it.warmRestSec : 0)}`,
      [{ l: 'Verlauf', f: () => { closeModal(); go('exercise', it.exId); } }, idx > 0 ? { l: '↑ Hoch', f: () => { const a = S.active.items; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; saveNow(); render(); } } : null,
       { l: 'Entfernen', c: 'danger', f: () => { S.active.items.splice(idx, 1); saveNow(); render(); } }]);
  },
  snote: el => {
    const it = S.active.items[+el.dataset.id], e = S.exercises.find(x => x.id === it.exId);
    modal(`<h3>Notizen · ${esc(e.name)}</h3>
      <label class="l">Dauerhafte Notiz (z.B. Sitz Stufe 4, Griffbreite)</label><textarea class="f" id="mN1" rows="2">${esc(e.note || '')}</textarea>
      <label class="l">Notiz nur für heute (z.B. Schulter zwickt)</label><textarea class="f" id="mN2" rows="2">${esc(it.note || '')}</textarea>`,
      [{ l: 'Abbrechen' }, { l: 'Speichern', c: 'pri', f: () => { e.note = $('#mN1').value.trim(); it.note = $('#mN2').value.trim(); saveNow(); render(); } }]);
  },
  ririnfo: () => modal(`<h3>RIR: Wiederholungen im Tank</h3><p class="info">Wie viele saubere Wiederholungen hättest du noch geschafft?</p>
    <div class="kv"><span><b>0</b></span><span class="mut">Muskelversagen, nichts ging mehr</span></div><div class="kv"><span><b>1</b></span><span class="mut">noch 1 Wdh. drin</span></div><div class="kv"><span><b>2</b></span><span class="mut">noch 2 Wdh. drin</span></div><div class="kv"><span><b>3–4</b></span><span class="mut">locker (Deload, Wiedereinstieg)</span></div>
    <p class="info">Für Muskelaufbau sind meist <b>0–3 RIR</b> bei Arbeitssätzen ideal. Am Anfang deines Wiedereinstiegs eher 2–4. Das Feld ist freiwillig.</p>`, [{ l: 'OK', c: 'pri' }]),
  sst: el => { const it = S.active.items[+el.dataset.id], f = el.dataset.f; let v = (f === 'warmRestSec' && !it.warmRest ? 0 : it[f]) + (+el.dataset.s); v = Math.max(0, Math.min(600, v)); it[f] = v; if (f === 'warmRestSec') it.warmRest = v > 0; el.parentNode.querySelector('input').value = mmss(v); saveNow(); render(); },
  sexadd: () => pickExercise(e => { S.active.items.push(buildItem(newItem(e.id), S.active.deload)); saveNow(); render(); setTimeout(() => { const v = $('#view'); v.scrollTop = v.scrollHeight; }, 30); }),
  mexpick: el => { $('#mEx').value = el.dataset.id; },
  finish: () => finishWorkout(),
  discard: () => modal('<h3>Training verwerfen?</h3><p class="info">Alle Eingaben dieses Trainings gehen verloren.</p>', [{ l: 'Abbrechen' }, { l: 'Verwerfen', c: 'danger', f: () => { S.active = null; stopTimer(); keepAwake(false); saveNow(); stack = []; tab = 'training'; render(true); } }]),
  tskip: () => stopTimer(),
  tadj: el => adjTimer(+el.dataset.id),
  // Verlauf
  hseg: el => { ui.histSeg = el.dataset.id; render(true); },
  wdetail: el => go('workout', el.dataset.id),
  exdetail: el => go('exercise', el.dataset.id),
  exmetric: el => { ui.exMetric = el.dataset.id; render(); },
  exrename: el => { const e = S.exercises.find(x => x.id === el.dataset.id); modal(`<h3>Übung umbenennen</h3><input class="f" id="mRn" value="${esc(e.name)}">`, [{ l: 'Abbrechen' }, { l: 'Speichern', c: 'pri', f: () => { const n = $('#mRn').value.trim(); if (!n) return false; e.name = n; saveNow(); render(); } }]); },
  wdel: el => modal('<h3>Training löschen?</h3><p class="info">Das kann nicht rückgängig gemacht werden.</p>', [{ l: 'Abbrechen' }, { l: 'Löschen', c: 'danger', f: () => { S.workouts = S.workouts.filter(w => w.id !== el.dataset.id); saveNow(); stack.pop(); render(true); } }]),
  // Einstellungen
  sset: el => { S.settings[el.dataset.id] = el.checked; saveNow(); },
  tst: el => { setPath(el.dataset.id, S.settings[el.dataset.id] + (+el.dataset.s)); saveNow(); render(); },
  stepkg: el => { S.settings.step = +el.dataset.id; saveNow(); render(); },
  export: () => exportData(),
  import: () => { if (NATIVE) Android.importFile(); else $('#fileIn').click(); },
  pickfolder: () => Android.pickBackupFolder()
};
function tstepS(idx, f, v) { return `<div class="stepper"><button data-a="sst" data-id="${idx}" data-f="${f}" data-s="-15">−</button><input readonly value="${mmss(v)}"><button data-a="sst" data-id="${idx}" data-f="${f}" data-s="15">+</button></div>`; }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a;
  if (el.tagName === 'INPUT' && el.type !== 'checkbox') return;
  if (A[a]) A[a](el, e);
});
document.addEventListener('change', e => {
  const el = e.target; const a = el.dataset.a;
  if (a === 'cyclestart') { S.settings.cycle.start = el.value || null; saveNow(); render(); }
  if (a === 'stpin') { setPath(el.dataset.id, parseInt(el.value) || 0); saveNow(); render(); }
  if (a === 'iname') { const it = curPlan().items.find(i => i.id === el.dataset.id); const ex = exByName(el.value); if (ex) { it.exId = ex.id; saveNow(); } else { el.value = exName(it.exId); } }
  if (a === 'hkg' || a === 'hreps' || a === 'hrir') { const w = S.workouts.find(x => x.id === el.dataset.id); const s = w.items[+el.dataset.i].sets[+el.dataset.s]; const v = num(el.value); const f = { hkg: 'kg', hreps: 'reps', hrir: 'rir' }[a]; if (a === 'hrir' && el.value.trim() === '') { delete s.rir; saveNow(); } else if (isFinite(v) && v >= 0) { s[f] = v; saveNow(); } }
});
document.addEventListener('input', e => {
  const el = e.target; const a = el.dataset.a;
  if (a === 'pname') { curPlan().name = el.value; $('#top h1').textContent = el.value || 'Neuer Plan'; saveSoon(); }
  if (a === 'ireps') { curPlan().items.find(i => i.id === el.dataset.id).reps = el.value; saveSoon(); }
  if (a === 'srir') {
    const s = S.active.items[+el.dataset.id].sets[+el.dataset.s]; const v = num(el.value.trim());
    s.rir = isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : ''; saveSoon();
  }
  if (a === 'inote') { const it = curPlan().items.find(i => i.id === el.dataset.id); const e = S.exercises.find(x => x.id === it.exId); if (e) { e.note = el.value; saveSoon(); } }
  if (a === 'skg' || a === 'sreps') {
    const s = S.active.items[+el.dataset.id].sets[+el.dataset.s];
    const v = el.value.trim(); s[a === 'skg' ? 'kg' : 'reps'] = v === '' ? '' : (isFinite(num(v)) ? num(v) : s[a === 'skg' ? 'kg' : 'reps']);
    saveSoon();
  }
});
document.addEventListener('focusin', e => { if (e.target.matches('.sets input, #wIn')) setTimeout(() => e.target.select(), 0); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.sets input')) e.target.blur(); });

// ---------- Start ----------
load();
if (S.active) { stack = [{ v: 'session' }]; tab = 'training'; keepAwake(true); }
else if (!S.weights.some(w => w.d === dkey()) && new Date().getHours() < 12) tab = 'weight';
else tab = 'training';
render(true);
window.addEventListener('resize', () => document.querySelectorAll('.chart[data-chart]').forEach(drawChartInto));
