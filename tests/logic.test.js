'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GL = require('../app/src/main/assets/logic.js');

const BENCH = { load: 'weight', step: 2.5, barbell: true };
const SQUAT = { load: 'weight', step: 5, barbell: true };
const ISO = { load: 'weight', step: 1.25 };
const DIPS = { load: 'bwplus', step: 2.5 };
const benchTpl = [
  { t: 'w', goal: '10', rest: 0, kg: 20 },
  { t: 'w', goal: '5', rest: 0, pct: 50 },
  { t: 'w', goal: '3', rest: 60, pct: 68.75 },
  { t: 'w', goal: '1', rest: 150, pct: 87.5 },
  { t: 'top', goal: '1-3', rest: 210, kg: 80, kgAt: 1 },
  { t: 'bo', goal: '4-6', rest: 180, factor: 0.875 },
  { t: 'bo', goal: '4-6', rest: 180, factor: 0.875 }
];
const sess = (start, sets, deload = false) => ({ start, deload, sets });
const normal = { phase: 'normal', reW: null };

test('range und Runden', () => {
  assert.deepEqual(GL.range('8-12'), [8, 12]);
  assert.deepEqual(GL.range('5'), [5, 5]);
  assert.equal(GL.roundTo(71.9, 2.5), 72.5);
  assert.equal(GL.roundTo(66.6, 1.25), 66.25);
});

test('kg-Feld: Prozent oder fest', () => {
  assert.deepEqual(GL.parseKgField('55%'), { pct: 55 });
  assert.deepEqual(GL.parseKgField('87,5 %'), { pct: 87.5 });
  assert.deepEqual(GL.parseKgField('60'), { kg: 60 });
  assert.deepEqual(GL.parseKgField(''), {});
});

test('Aufwärmen in Prozent: 2,5 kg Rundung, mind. 20 kg Langhantel', () => {
  assert.equal(GL.warmupKg(80, 55, true), 45);
  assert.equal(GL.warmupKg(30, 50, true), 20);
  assert.equal(GL.warmupKg(30, 50, false), 15);
  assert.equal(GL.warmupKg(NaN, 50, true), '');
});

test('Back-off = Top Set × Faktor, auf 2,5 kg', () => {
  assert.equal(GL.backoffKg(80, 0.875), 70);
  assert.equal(GL.backoffKg(142.5, 0.85), 120); // 121,1 -> 120
});

test('Wochenzähler: 4 Wochen Wiedereinstieg, dann 7er Blöcke mit Deload in Woche 7', () => {
  const c = { start: '2026-11-30' }; // Montag
  assert.equal(GL.weekInfo(c, '2026-11-30').week, 1);
  assert.equal(GL.weekInfo(c, '2026-12-06').reW, 1);
  assert.equal(GL.weekInfo(c, '2026-12-21').reW, 4);
  const w5 = GL.weekInfo(c, '2026-12-28');
  assert.equal(w5.phase, 'normal'); assert.equal(w5.blockWeek, 1); assert.equal(w5.nextDeloadWeek, 11);
  const w11 = GL.weekInfo(c, '2027-02-08');
  assert.equal(w11.week, 11); assert.equal(w11.isDeload, true);
  assert.equal(GL.weekInfo(c, '2027-02-15').blockWeek, 1);
  assert.equal(GL.weekInfo(c, '2027-03-29').isDeload, true); // Woche 18
  assert.equal(GL.weekInfo({}, '2026-12-01'), null);
});

test('RIR-Ziel je Phase', () => {
  assert.equal(GL.rirTarget('1', { phase: 'reentry', reW: 1 }), '3');
  assert.equal(GL.rirTarget('1', { phase: 'reentry', reW: 2 }), '2-3');
  assert.equal(GL.rirTarget('0-1', { phase: 'reentry', reW: 3 }), '2');
  assert.equal(GL.rirTarget('0-1', { phase: 'reentry', reW: 4 }), '0-1');
  assert.equal(GL.rirTarget('1', normal, true), '3-4');
});

test('Erstes Training: Top Set aus dem Plan, Back-off und Aufwärmen berechnet', () => {
  const r = GL.buildSession(BENCH, benchTpl, [], { info: normal, lastStart: 0 });
  assert.deepEqual(r.sets.map(s => [s.t, s.kg]), [['w', 20], ['w', 40], ['w', 55], ['w', 70], ['top', 80], ['bo', 70], ['bo', 70]]);
  assert.equal(r.sets[4].reps, 1);
  assert.equal(r.sets[4].rest, 210);
});

test('Top Set: oberes Ende erreicht -> +2,5 kg, Kniebeuge +5 kg', () => {
  const h = [sess(100, [{ t: 'top', kg: 80, reps: 3 }, { t: 'bo', kg: 70, reps: 6 }])];
  const r = GL.buildSession(BENCH, benchTpl, h, { info: normal, lastStart: 100 });
  const top = r.sets.find(s => s.t === 'top');
  assert.equal(top.kg, 82.5); assert.equal(top.reps, 1);
  assert.equal(r.sets.find(s => s.t === 'bo').kg, 72.5);
  assert.equal(r.hint.dir, 'up');
  const sq = GL.propose(SQUAT, [{ t: 'top', goal: '3-5' }], [sess(1, [{ t: 'top', kg: 100, reps: 5 }])], 1);
  assert.equal(sq.sets[0].kg, 105);
});

test('Top Set: nicht oben -> gleiches Gewicht; zweimal unteres Ende verpasst -> −10 %', () => {
  const same = GL.propose(BENCH, [{ t: 'top', goal: '1-3' }], [sess(2, [{ t: 'top', kg: 80, reps: 2 }])], 2);
  assert.equal(same.sets[0].kg, 80); assert.equal(same.hint, null);
  const stall = GL.propose(SQUAT, [{ t: 'top', goal: '3-5' }], [sess(3, [{ t: 'top', kg: 100, reps: 2 }]), sess(2, [{ t: 'top', kg: 100, reps: 2 }])], 3);
  assert.equal(stall.sets[0].kg, 90); assert.equal(stall.hint.dir, 'down');
});

test('Doppelte Progression: erst wenn alle Sätze oben sind', () => {
  const tpl = [{ t: 'n', goal: '8-12' }, { t: 'n', goal: '8-12' }, { t: 'n', goal: '8-12' }];
  const notYet = GL.propose(BENCH, tpl, [sess(1, [{ t: 'n', kg: 60, reps: 12 }, { t: 'n', kg: 60, reps: 12 }, { t: 'n', kg: 60, reps: 10 }])], 1);
  assert.deepEqual(notYet.sets.map(s => s.kg), [60, 60, 60]);
  assert.deepEqual(notYet.sets.map(s => s.reps), [12, 12, 10]);
  const up = GL.propose(ISO, tpl, [sess(1, [{ t: 'n', kg: 20, reps: 12 }, { t: 'n', kg: 20, reps: 13 }, { t: 'n', kg: 20, reps: 12 }])], 1);
  assert.deepEqual(up.sets.map(s => s.kg), [21.25, 21.25, 21.25]);
  assert.deepEqual(up.sets.map(s => s.reps), [8, 8, 8]);
});

test('Doppelte Progression: Stillstand nach zweimal unterem Ende verpasst', () => {
  const tpl = [{ t: 'n', goal: '8-12' }, { t: 'n', goal: '8-12' }];
  const h = [sess(2, [{ t: 'n', kg: 60, reps: 7 }, { t: 'n', kg: 60, reps: 8 }]), sess(1, [{ t: 'n', kg: 60, reps: 8 }, { t: 'n', kg: 60, reps: 6 }])];
  const r = GL.propose(BENCH, tpl, h, 2);
  assert.deepEqual(r.sets.map(s => s.kg), [55, 55]);
  assert.equal(r.hint.dir, 'down');
});

test('Gewicht im Plan neuer als letztes Training gewinnt', () => {
  const r = GL.propose(BENCH, [{ t: 'n', goal: '8-12', kg: 50, kgAt: 5 }], [sess(4, [{ t: 'n', kg: 60, reps: 9 }])], 4);
  assert.equal(r.sets[0].kg, 50);
  const old = GL.propose(BENCH, [{ t: 'n', goal: '8-12', kg: 50, kgAt: 3 }], [sess(4, [{ t: 'n', kg: 60, reps: 9 }])], 4);
  assert.equal(old.sets[0].kg, 60);
});

test('Körpergewicht + Zusatz: Progression aufs Zusatzgewicht, Aufwärmen ohne 20-kg-Minimum', () => {
  const tpl = [{ t: 'w', goal: '5', kg: 0 }, { t: 'w', goal: '2', pct: 50 }, { t: 'n', goal: '5-8' }, { t: 'n', goal: '5-8' }];
  const h = [sess(1, [{ t: 'n', kg: 10, reps: 8 }, { t: 'n', kg: 10, reps: 8 }])];
  const r = GL.buildSession(DIPS, tpl, h, { info: normal, lastStart: 1 });
  assert.deepEqual(r.sets.map(s => s.kg), [0, 7.5, 12.5, 12.5]); // 50 % von 12,5 = 6,25 -> 7,5
});

test('Wiedereinstieg Woche 1: 2 Arbeitssätze, Top-Set-Übung 3×5 leicht', () => {
  const iso = GL.buildSession(ISO, [{ t: 'n', goal: '10-15' }, { t: 'n', goal: '10-15' }, { t: 'n', goal: '10-15' }, { t: 'n', goal: '10-15' }], [], { info: { phase: 'reentry', reW: 1 } });
  assert.equal(iso.sets.length, 2);
  const b = GL.buildSession(BENCH, benchTpl, [], { info: { phase: 'reentry', reW: 1 } });
  const work = b.sets.filter(s => s.t !== 'w');
  assert.equal(work.length, 3);
  assert.ok(work.every(s => s.t === 'n' && s.goal === '5'));
  const w2 = GL.buildSession(ISO, [{ t: 'n', goal: '10-15' }, { t: 'n', goal: '10-15' }, { t: 'n', goal: '10-15' }], [], { info: { phase: 'reentry', reW: 2 } });
  assert.equal(w2.sets.length, 3);
  const w3 = GL.buildSession(BENCH, benchTpl, [], { info: { phase: 'reentry', reW: 3 } });
  assert.ok(w3.sets.some(s => s.t === 'top'));
});

test('Deload: Sätze halbieren (aufrunden), −10 %, kein Top Set', () => {
  const h = [sess(1, [{ t: 'top', kg: 80, reps: 2 }, { t: 'bo', kg: 70, reps: 5 }, { t: 'bo', kg: 70, reps: 5 }])];
  const r = GL.buildSession(BENCH, benchTpl, h, { info: { phase: 'deload' }, deload: true, lastStart: 1 });
  const work = r.sets.filter(s => s.t !== 'w');
  assert.equal(work.length, 2);
  assert.ok(work.every(s => s.t === 'n'));
  assert.equal(work[0].kg, 62.5); // 70 × 0,9 = 63 -> 62,5
  const three = GL.buildSession(ISO, [{ t: 'n', goal: '8' }, { t: 'n', goal: '8' }, { t: 'n', goal: '8' }], [sess(1, [{ t: 'n', kg: 20, reps: 8 }])], { deload: true });
  assert.equal(three.sets.length, 2);
  assert.equal(three.sets[0].kg, 17.5); // 18 auf Isolationsschritt 1,25 gerundet
});

test('Deload-Trainings zählen nicht für die Progression', () => {
  const h = [sess(2, [{ t: 'n', kg: 50, reps: 12 }], true), sess(1, [{ t: 'n', kg: 60, reps: 9 }])];
  const r = GL.buildSession(BENCH, [{ t: 'n', goal: '8-12' }], h, { info: normal, lastStart: 2 });
  assert.equal(r.sets[0].kg, 60);
});

test('Nachrechnen: Top Set geändert -> Aufwärmen und Back-off folgen, manuelle Werte bleiben', () => {
  const r = GL.buildSession(BENCH, benchTpl, [], { info: normal });
  const top = r.sets.find(s => s.t === 'top'); top.kg = 100;
  r.sets[6].manual = true; r.sets[6].kg = 80;
  GL.recalc(r.sets, BENCH);
  assert.deepEqual(r.sets.map(s => s.kg), [20, 50, 70, 87.5, 100, 87.5, 80]);
});

test('Sätze pro Muskel: Haupt 1, Mithilfe 0,5', () => {
  const ex = { a: { muscles: { Brust: 1, Trizeps: 0.5 } }, b: { muscles: { Trizeps: 1 } } };
  const r = GL.muscleSets([{ exId: 'a', sets: [{ t: 'w' }, { t: 'top' }, { t: 'bo' }, { t: 'bo' }] }, { exId: 'b', sets: [{ t: 'n' }, { t: 'n' }] }], ex);
  assert.deepEqual(r, { Brust: 3, Trizeps: 3.5 });
});
