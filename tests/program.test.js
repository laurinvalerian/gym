'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/src/main/assets/program.js');
const GL = require('../app/src/main/assets/logic.js');

let n = 0; const uid = () => 'id' + (n++);
const fresh = () => ({ weights: [{ d: '2026-11-20', kg: 82 }], workouts: [], exercises: [{ id: 'old', name: 'Test' }], plans: [{ id: 'p', name: 'Alt', items: [] }], settings: { cycle: { start: '2026-11-27', firstBlock: 8, block: 6 }, deload: {}, deloadOn: true } });

test('Seed: 6 Trainingstage Mo bis Sa, alte Test-Pläne und Übungen weg', () => {
  const S = fresh();
  assert.equal(P.applyProgram(S, uid, 1000), true);
  assert.deepEqual(S.plans.map(p => [p.day, p.name]), [[1, 'Push A'], [2, 'Pull A'], [3, 'Legs A'], [4, 'Push B'], [5, 'Pull B'], [6, 'Legs B']]);
  assert.ok(!S.exercises.some(e => e.id === 'old'));
  assert.equal(S.weights.length, 1);
  assert.equal(S.settings.cycle.start, null);
  assert.equal(S.settings.deloadOn, false);
  assert.equal(P.applyProgram(S, uid, 2000), false, 'nur einmal');
});

test('Seed: Übungen mit Historie bleiben (versteckt) erhalten', () => {
  const S = fresh(); S.workouts.push({ items: [{ exId: 'old', sets: [] }] });
  P.applyProgram(S, uid, 1);
  assert.equal(S.exercises.find(e => e.id === 'old').archived, true);
});

test('Seed: Bankdrücken mit Aufwärmen, Top Set 80 kg und 2 Back-off', () => {
  const S = fresh(); P.applyProgram(S, uid, 1000);
  const it = S.plans[0].items[0], ex = S.exercises.find(e => e.id === it.exId);
  assert.equal(ex.name, 'Bankdrücken (Heavy)');
  assert.deepEqual(it.sets.map(s => s.t), ['w', 'w', 'w', 'w', 'top', 'bo', 'bo']);
  assert.deepEqual(it.sets.map(s => s.rest), [0, 0, 60, 150, 210, 180, 180]);
  const r = GL.buildSession(ex, it.sets, [], { info: { phase: 'normal' }, lastStart: 0 });
  assert.deepEqual(r.sets.map(s => s.kg), [20, 40, 55, 70, 80, 70, 70]);
});

test('Seed: Supersatz, pro Bein, Alternativen, Körpergewicht + Zusatz', () => {
  const S = fresh(); P.applyProgram(S, uid, 1);
  const name = id => S.exercises.find(e => e.id === id).name;
  const pullB = S.plans[4].items;
  assert.equal(pullB[4].ss, true);
  assert.equal(pullB[4].sets[0].rest, 0);
  const lunges = S.plans[5].items[3];
  assert.equal(S.exercises.find(e => e.id === lunges.exId).perLeg, true);
  assert.equal(name(S.plans[0].items[1].alts[0]), 'Schrägbank Kurzhantel');
  assert.equal(S.exercises.find(e => e.name === 'Dips mit Zusatzgewicht').load, 'bwplus');
  // Klimmzüge in Pull A und Alternative in Pull B sind dieselbe Übung (gemeinsame Historie)
  assert.equal(S.plans[4].items[0].alts[0], S.plans[1].items[0].exId);
});

test('Seed: Sätze pro Muskel pro Woche (geplant)', () => {
  const S = fresh(); P.applyProgram(S, uid, 1);
  const byId = Object.fromEntries(S.exercises.map(e => [e.id, e]));
  const m = GL.muscleSets(S.plans.flatMap(p => p.items), byId);
  // Brust: Bank 3 + Schrägbank 3 + Dips 2 + Multipresse 3 + Butterfly 3 = 14
  assert.equal(m.Brust, 14);
  // Trizeps: 0,5 × (3+3+2+3) + Überkopf 3 + Schulterdrücken 1,5 + Skull 3 = 13
  assert.equal(m.Trizeps, 13);
});
