'use strict';
/* GymLog Trainingslogik ohne Oberfläche: läuft im Browser (window.GL) und in Node (Unit Tests). */
(function (root) {
  const DAY = 864e5;
  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const pdate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const monday = k => { const d = pdate(k); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dkey(d); };
  const num = v => (v === '' || v == null) ? NaN : parseFloat(String(v).replace(',', '.'));
  const has = v => v !== '' && v != null && isFinite(num(v));

  /** "8-12" -> [8, 12], "5" -> [5, 5] */
  function range(r) { const n = String(r ?? '').match(/\d+(?:[.,]\d+)?/g); if (!n) return [8, 8]; return [num(n[0]), num(n[n.length - 1])]; }
  /** Auf Schrittweite runden (Gleitkomma-sicher) */
  function roundTo(v, step) { if (!isFinite(v)) return v; const r = Math.round(v / step) * step; return Math.round(r * 1000) / 1000; }

  /** Eingabe im kg-Feld einer Plan-Vorlage: "55%" -> {pct:55}, "60" -> {kg:60}, "" -> {} */
  function parseKgField(str) {
    const t = String(str ?? '').trim();
    if (!t) return {};
    if (t.endsWith('%')) { const p = num(t.slice(0, -1)); return isFinite(p) ? { pct: p } : {}; }
    const k = num(t); return isFinite(k) ? { kg: k } : {};
  }

  /** Aufwärmgewicht: Prozent vom Referenzgewicht, auf 2,5 kg gerundet, min. 20 kg bei Langhantel */
  function warmupKg(ref, pct, barbell) {
    if (!isFinite(ref) || !isFinite(pct)) return '';
    const kg = roundTo(ref * pct / 100, 2.5);
    return barbell ? Math.max(20, kg) : Math.max(0, kg);
  }
  /** Back-off: tatsächliches Top-Set-Gewicht × Faktor, auf 2,5 kg gerundet */
  function backoffKg(topKg, factor) { return isFinite(topKg) && isFinite(factor) ? roundTo(topKg * factor, 2.5) : ''; }

  /**
   * Wochenzähler. Woche 1 bis `reentry` = Wiedereinstieg, danach Blöcke à `block` Wochen,
   * die letzte Woche jedes Blocks ist Deload.
   */
  function weekInfo(cycle, today) {
    const c = Object.assign({ reentry: 4, block: 7 }, cycle || {});
    if (!c.start) return null;
    const w = Math.max(0, Math.round((pdate(monday(today)) - pdate(monday(c.start))) / DAY / 7));
    const week = w + 1;
    if (week <= c.reentry) {
      const firstDeload = c.reentry + c.block;
      return { week, phase: 'reentry', reW: week, isDeload: false, blockWeek: null, nextDeloadWeek: firstDeload, dueIn: firstDeload - week };
    }
    const bw = (week - c.reentry - 1) % c.block + 1;
    const isDeload = bw === c.block;
    const nextDeloadWeek = week + (isDeload ? c.block : c.block - bw);
    return { week, phase: isDeload ? 'deload' : 'normal', reW: null, isDeload, blockWeek: bw, nextDeloadWeek, dueIn: nextDeloadWeek - week };
  }
  /** Datum (Montag) einer Programmwoche */
  function weekStart(cycle, week) { return dkey(new Date(+pdate(monday(cycle.start)) + (week - 1) * 7 * DAY + 12 * 3600e3)); }

  /** RIR-Ziel je nach Phase */
  function rirTarget(planRir, info, deload) {
    if (deload) return '3-4';
    if (info && info.phase === 'reentry') return ({ 1: '3', 2: '2-3', 3: '2' })[info.reW] || planRir || '';
    return planRir || '';
  }

  /**
   * Gewichts- und Wdh.-Vorschlag für die Arbeitssätze nach den Progressionsregeln.
   * work: Vorlagen-Sätze (t: 'top' | 'n' | 'bo'); hist: frühere normale Einheiten dieser Übung, neueste zuerst
   * Rückgabe: { sets:[{t, kg, reps, goal, rest, factor?}], hint }
   */
  function propose(ex, work, hist, lastStart) {
    const step = ex.step || 2.5, kgOn = ex.load !== 'bw';
    const r = v => roundTo(v, step);
    const typed = (s, t) => (s.sets || []).filter(x => x.t === t);
    const out = []; let hint = null; const st = String(step).replace('.', ',');
    // Top Set: oberes Ende erreicht -> +Schritt; zweimal unteres Ende verpasst -> -10 %
    const tops = hist.map(s => typed(s, 'top')[0]).filter(Boolean);
    // Doppelte Progression für normale Sätze
    const tplN = work.filter(t => t.t === 'n');
    const lastN = hist.length ? typed(hist[0], 'n') : [];
    const missLo = s => typed(s, 'n').some((x, j) => num(x.reps) < range((tplN[j] || tplN[tplN.length - 1] || {}).goal)[0]);
    const nUp = tplN.length > 0 && lastN.length >= tplN.length && lastN.every((x, j) => num(x.reps) >= range((tplN[j] || tplN[tplN.length - 1]).goal)[1]);
    const nStall = !nUp && hist.length >= 2 && typed(hist[0], 'n').length > 0 && typed(hist[1], 'n').length > 0 && missLo(hist[0]) && missLo(hist[1]);
    let ni = 0, bi = 0, topKg = NaN;
    for (const t of work) {
      const [lo, hi] = range(t.goal);
      const tplWins = has(t.kg) && (t.kgAt || 0) > (lastStart || 0);
      if (t.t === 'top') {
        const last = tops[0];
        let kg = NaN, reps = lo;
        if (last) {
          kg = num(last.kg); reps = num(last.reps);
          if (num(last.reps) >= hi) { kg = r(kg + step); reps = lo; hint = { dir: 'up', text: `Top Set: oberes Ende erreicht, +${st} kg` }; }
          else if (tops[1] && num(last.reps) < lo && num(tops[1].reps) < lo) { kg = roundTo(kg * 0.9, 2.5); reps = lo; hint = { dir: 'down', text: 'Top Set: zweimal unteres Ende verpasst, −10 %' }; }
        }
        if (tplWins) kg = num(t.kg);
        topKg = kg;
        out.push({ t: 'top', kg: kgOn && isFinite(kg) ? kg : '', reps: isFinite(reps) ? reps : lo, goal: t.goal, rest: t.rest });
      } else if (t.t === 'bo') {
        const lastBo = hist.length ? typed(hist[0], 'bo') : [];
        const b = lastBo[bi] || lastBo[lastBo.length - 1];
        const factor = t.factor || 0.875;
        let kg = backoffKg(topKg, factor);
        if (kg === '' && b) kg = num(b.kg);
        out.push({ t: 'bo', kg: kgOn && isFinite(kg) ? kg : '', reps: b ? num(b.reps) : lo, goal: t.goal, rest: t.rest, factor });
        bi++;
      } else {
        const b = lastN[ni] || lastN[lastN.length - 1];
        let kg = b ? num(b.kg) : NaN, reps = b ? num(b.reps) : lo;
        if (b && nUp) { kg = r(kg + step); reps = lo; }
        else if (b && nStall) { kg = roundTo(kg * 0.9, 2.5); reps = lo; }
        if (tplWins) kg = num(t.kg);
        out.push({ t: 'n', kg: kgOn && isFinite(kg) ? kg : '', reps: isFinite(reps) ? reps : lo, goal: t.goal, rest: t.rest });
        ni++;
      }
    }
    if (!hint && nUp && lastN.length) hint = { dir: 'up', text: `Alle Sätze am oberen Ende, +${st} kg` };
    if (!hint && nStall) hint = { dir: 'down', text: 'Zweimal unteres Ende verpasst, −10 %' };
    return { sets: out, hint };
  }

  /**
   * Komplette Sätze für ein Training.
   * opts: { info (weekInfo), deload, deloadCfg:{weightPct, repsPct, setsPct}, lastStart }
   */
  function buildSession(ex, tpl, history, opts = {}) {
    const info = opts.info || null, deload = !!opts.deload, cfg = opts.deloadCfg || { weightPct: 10, repsPct: 0, setsPct: 50 };
    const hist = (history || []).filter(h => !h.deload);
    const tplW = tpl.filter(t => t.t === 'w'), tplWork = tpl.filter(t => t.t !== 'w');
    const hasTop = tplWork.some(t => t.t === 'top');
    const reW = info && info.phase === 'reentry' ? info.reW : null;
    let work, hint = null, note = null;

    if (!deload && hasTop && reW && reW <= 2) {
      // Wiedereinstieg Woche 1 und 2: Top-Set-Übungen nur 3×5 leicht
      const rest = (tplWork.find(t => t.t === 'bo') || tplWork[0]).rest;
      const p = propose(ex, [0, 1, 2].map(() => ({ t: 'n', goal: '5', rest })), hist, opts.lastStart);
      work = p.sets; hint = p.hint; note = 'Wiedereinstieg: 3×5 leicht statt Top Set';
    } else {
      const p = propose(ex, tplWork, hist, opts.lastStart);
      work = p.sets; hint = p.hint;
      if (deload) {
        // Deload: Sätze halbieren (aufrunden), Gewicht −10 %, kein Top Set
        const count = Math.max(1, Math.ceil(tplWork.length * (1 - cfg.setsPct / 100)));
        let pool = work.filter(s => s.t !== 'top');
        if (!pool.length) pool = work;
        const step = ex.step || 2.5;
        work = Array.from({ length: count }, (_, i) => {
          const s = pool[Math.min(i, pool.length - 1)];
          const kg = isFinite(num(s.kg)) ? roundTo(num(s.kg) * (1 - cfg.weightPct / 100), Math.min(step, 2.5)) : '';
          return { t: 'n', kg: ex.load !== 'bw' && isFinite(kg) ? kg : '', reps: Math.max(1, Math.round(num(s.reps) * (1 - cfg.repsPct / 100))), goal: s.goal, rest: s.rest };
        });
        hint = null; if (hasTop) note = 'Deload: kein Top Set';
      } else if (reW === 1 && work.length > 2) {
        work = work.slice(0, 2); note = 'Wiedereinstieg: 2 Arbeitssätze';
      }
    }
    // Aufwärmen: Prozent vom Top Set bzw. ersten Arbeitssatz
    const refSet = work.find(s => s.t === 'top') || work[0];
    const ref = refSet ? num(refSet.kg) : NaN;
    const lastWarm = hist.length ? hist[0].sets.filter(x => x.t === 'w') : [];
    const warm = tplW.map((t, i) => {
      let kg = '';
      if (ex.load !== 'bw') {
        if (has(t.pct)) kg = warmupKg(ref, num(t.pct), ex.barbell && ex.load === 'weight');
        else if (has(t.kg)) kg = num(t.kg);
        else if (lastWarm[i]) kg = lastWarm[i].kg;
      }
      return { t: 'w', kg, reps: range(t.goal)[0], goal: t.goal, rest: t.rest, pct: has(t.pct) ? num(t.pct) : undefined };
    });
    // Reihenfolge der Vorlage beibehalten: Aufwärmen zuerst wie im Plan, dann Arbeitssätze
    const sets = [];
    let wi = 0, ki = 0;
    for (const t of tpl) {
      if (t.t === 'w') sets.push(warm[wi++]);
      else if (ki < work.length) sets.push(work[ki++]);
    }
    while (ki < work.length) sets.push(work[ki++]);
    return { sets: sets.map(s => Object.assign({ rir: '', done: false }, s)), hint, note };
  }

  /** Nach Änderung des Top Sets bzw. ersten Arbeitssatzes: offene Aufwärm- und Back-off-Sätze neu rechnen */
  function recalc(sets, ex) {
    const top = sets.find(s => s.t === 'top') || sets.find(s => s.t !== 'w');
    if (!top) return sets;
    const ref = num(top.kg);
    for (const s of sets) {
      if (s.done || s.manual) continue;
      if (s.t === 'w' && has(s.pct)) s.kg = warmupKg(ref, num(s.pct), ex.barbell && ex.load === 'weight');
      if (s.t === 'bo' && has(s.factor) && top.t === 'top') s.kg = backoffKg(ref, num(s.factor));
    }
    return sets;
  }

  /** Arbeitssätze pro Muskel. items: [{exId, sets:[{t}], done?}], nur Arbeitssätze zählen */
  function muscleSets(items, exById, onlyDone) {
    const out = {};
    for (const it of items) {
      const ex = exById[it.exId]; if (!ex || !ex.muscles) continue;
      const n = it.sets.filter(s => s.t !== 'w' && (!onlyDone || s.done !== false)).length;
      for (const m in ex.muscles) out[m] = (out[m] || 0) + n * ex.muscles[m];
    }
    return out;
  }

  const GL = { range, roundTo, parseKgField, warmupKg, backoffKg, weekInfo, weekStart, rirTarget, propose, buildSession, recalc, muscleSets, monday, dkey, pdate };
  if (typeof module !== 'undefined' && module.exports) module.exports = GL; else root.GL = GL;
})(typeof window !== 'undefined' ? window : globalThis);
