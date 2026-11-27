'use strict';
/* Trainingsplan PPL (6 Tage) als Vorlage. Wird einmalig in die App übernommen (Seed). */
(function (root) {
  const SEED_ID = 'ppl-2026-11';
  const M = (a, b) => Object.assign({}, a, b);
  const chest = { Brust: 1, Trizeps: 0.5 }, back = { 'Rücken': 1, Bizeps: 0.5 };
  // Übungen: Typ, Schrittweite, Langhantel, pro Bein, Muskeln
  const EX = {
    bench: { name: 'Bankdrücken (Heavy)', step: 2.5, barbell: true, muscles: chest },
    inclineBB: { name: 'Schrägbankdrücken Langhantel 30°', step: 2.5, barbell: true, muscles: chest },
    inclineDB: { name: 'Schrägbank Kurzhantel', step: 2, muscles: chest },
    dips: { name: 'Dips mit Zusatzgewicht', load: 'bwplus', step: 2.5, muscles: chest },
    chestPress: { name: 'Brustpresse Maschine', step: 2.5, muscles: chest },
    latRaiseM: { name: 'Seitheben Maschine', step: 1.25, muscles: { 'Schulter seitlich': 1 } },
    latRaiseC: { name: 'Seitheben Kabel beidarmig', step: 1.25, muscles: { 'Schulter seitlich': 1 } },
    ohTriC: { name: 'Trizeps Überkopf Kabel', step: 1.25, muscles: { Trizeps: 1 } },
    ohTriDB: { name: 'Überkopf Kurzhantel', step: 2, muscles: { Trizeps: 1 } },
    neckCurl: { name: 'Nacken Curls (Scheibe)', step: 1.25, muscles: { Nacken: 1 } },
    pullup: { name: 'Klimmzüge mit Zusatzgewicht', load: 'bwplus', step: 2.5, muscles: back },
    latPull: { name: 'Latzug', step: 2.5, muscles: back },
    tbar: { name: 'T-Bar Rudern brustgestützt', step: 2.5, muscles: back },
    dbRowIncl: { name: 'Kurzhantelrudern auf Schrägbank', step: 2, muscles: back },
    pulloverM: { name: 'Lat Pullover Maschine', step: 1.25, muscles: { 'Rücken': 1 } },
    pulloverC: { name: 'Kabel Pullover Seil', step: 1.25, muscles: { 'Rücken': 1 } },
    revFly: { name: 'Reverse Butterfly Maschine', step: 1.25, muscles: { 'Schulter hinten': 1 } },
    facePull: { name: 'Face Pulls', step: 1.25, muscles: { 'Schulter hinten': 1 } },
    scottSZ: { name: 'Scott Curls SZ-Stange', step: 1.25, muscles: { Bizeps: 1 } },
    scottDB: { name: 'Scott Curls Kurzhanteln', step: 1, muscles: { Bizeps: 1 } },
    shrugs: { name: 'Kurzhantel Shrugs', step: 2, muscles: { Trapez: 1 } },
    neckExt: { name: 'Nacken Extension (Kopfgeschirr)', step: 1.25, muscles: { Nacken: 1 } },
    squat: { name: 'Kniebeuge (Heavy)', step: 5, barbell: true, muscles: { Quads: 1, Po: 0.5 } },
    smithSquat: { name: 'Multipresse Kniebeuge', step: 2.5, muscles: { Quads: 1, Po: 0.5 } },
    rdl: { name: 'Rumänisches Kreuzheben', step: 2.5, barbell: true, muscles: { Beinbeuger: 1, Po: 0.5 } },
    dbRdl: { name: 'Kurzhantel RDL', step: 2, muscles: { Beinbeuger: 1, Po: 0.5 } },
    legCurlS: { name: 'Beinbeuger sitzend', step: 1.25, muscles: { Beinbeuger: 1 } },
    legCurlL: { name: 'Beinbeuger liegend', step: 1.25, muscles: { Beinbeuger: 1 } },
    legExt: { name: 'Beinstrecker', step: 1.25, muscles: { Quads: 1 } },
    calfSt: { name: 'Wadenheben stehend', step: 2.5, muscles: { Waden: 1 } },
    calfLP: { name: 'Wadenheben Beinpresse', step: 2.5, muscles: { Waden: 1 } },
    cableCrunch: { name: 'Kabel Crunch', step: 1.25, muscles: { Bauch: 1 } },
    crunchM: { name: 'Crunch Maschine', step: 1.25, muscles: { Bauch: 1 } },
    ohp: { name: 'Schulterdrücken Langhantel stehend', step: 2.5, barbell: true, muscles: { 'Schulter vorne': 1, Trizeps: 0.5 } },
    dbOhp: { name: 'Kurzhantel Schulterdrücken', step: 2, muscles: { 'Schulter vorne': 1, Trizeps: 0.5 } },
    smithIncl: { name: 'Schrägbankdrücken Multipresse 30°', step: 2.5, muscles: chest },
    flyM: { name: 'Butterfly Maschine', step: 1.25, muscles: { Brust: 1 } },
    cableCross: { name: 'Kabel überkreuz', step: 1.25, muscles: { Brust: 1 } },
    skull: { name: 'Skull Crushers SZ-Stange', step: 1.25, muscles: { Trizeps: 1 } },
    ropePush: { name: 'Trizepsdrücken Seil', step: 1.25, muscles: { Trizeps: 1 } },
    latPullN: { name: 'Latzug neutraler Griff', step: 2.5, muscles: back },
    cableRow: { name: 'Kabelrudern sitzend', step: 2.5, muscles: back },
    rowM: { name: 'Rudermaschine', step: 2.5, muscles: back },
    bayesian: { name: 'Bayesian Curl beidarmig', step: 1.25, muscles: { Bizeps: 1 } },
    inclCurl: { name: 'Schrägbankcurls Kurzhantel', step: 1, muscles: { Bizeps: 1 } },
    wristCurl: { name: 'Handgelenkcurls Kurzhantel', step: 1, muscles: { Unterarme: 1 } },
    wristExt: { name: 'Handgelenk Extension Kurzhantel', step: 1, muscles: { Unterarme: 1 } },
    deadlift: { name: 'Kreuzheben (Heavy)', step: 5, barbell: true, muscles: { Beinbeuger: 0.5, Po: 0.5, 'Rücken': 0.5 } },
    sumo: { name: 'Sumo Kreuzheben', step: 5, barbell: true, muscles: { Beinbeuger: 0.5, Po: 0.5, 'Rücken': 0.5 } },
    hack: { name: 'Hackenschmidt Kniebeuge', step: 2.5, muscles: { Quads: 1, Po: 0.5 } },
    pendulum: { name: 'Pendel oder Multipresse Kniebeuge', step: 2.5, muscles: { Quads: 1, Po: 0.5 } },
    hipThrust: { name: 'Hip Thrust', step: 2.5, barbell: true, muscles: { Po: 1 } },
    gluteDrive: { name: 'Glute Drive Maschine', step: 2.5, muscles: { Po: 1 } },
    lunges: { name: 'Ausfallschritte gehend Kurzhantel', step: 2, perLeg: true, muscles: { Po: 1, Quads: 0.5 } },
    legPress: { name: 'Beinpresse', step: 5, muscles: { Quads: 1, Po: 0.5 } }
  };
  // Satz-Bausteine: Aufwärmen (kg fest oder "x%"), Normal, Top Set, Back-off (Faktor)
  const R = s => { if (s === 'Aus' || s == null) return 0; const [m, x] = String(s).split(':'); return +m * 60 + +x; };
  const W = (goal, rest, kg) => { const s = { t: 'w', goal: String(goal), rest: R(rest) }; if (typeof kg === 'string' && kg.endsWith('%')) s.pct = parseFloat(kg); else if (kg != null) s.kg = kg; return s; };
  const N = (n, goal, rest) => Array.from({ length: n }, () => ({ t: 'n', goal, rest: R(rest) }));
  const T = (goal, rest, kg) => { const s = { t: 'top', goal, rest: R(rest) }; if (kg != null) s.kg = kg; return s; };
  const B = (n, goal, rest, factor) => Array.from({ length: n }, () => ({ t: 'bo', goal, rest: R(rest), factor }));
  const I = (ex, sets, rir, note, alt, extra) => Object.assign({ ex, sets: sets.flat(), rir, note: note || '', alts: alt ? [alt] : [] }, extra || {});

  const DAYS = [
    { day: 1, name: 'Push A', items: [
      I('bench', [W(10, 'Aus', 20), W(5, 'Aus', '50%'), W(3, '1:00', '68.75%'), W(1, '2:30', '87.5%'), T('1-3', '3:30', 80), B(2, '4-6', '3:00', 0.875)], '1', 'Sicherheitsablagen'),
      I('inclineBB', [W(5, '0:30', '55%'), N(3, '8-12', '2:00')], '1', 'Winkel immer gleich', 'inclineDB'),
      I('dips', [W(5, '1:00', 0), N(2, '6-10', '2:00')], '1', 'Leicht vorlehnen', 'chestPress'),
      I('latRaiseM', [W(10, 'Aus'), N(4, '10-15', '1:30')], '0-1', 'Letzter Satz plus Partials', 'latRaiseC'),
      I('ohTriC', [W(10, 'Aus'), N(3, '10-15', '1:30')], '0-1', 'Volle Dehnung hinter dem Kopf', 'ohTriDB'),
      I('neckCurl', [N(2, '15-20', '1:00')], '2', 'Kinn zur Brust, erste 4 Wochen leicht')
    ] },
    { day: 2, name: 'Pull A', items: [
      I('pullup', [W(5, '1:30', 0), W(2, '2:00', '50%'), N(3, '5-8', '3:00')], '1', 'Ab 8 sauberen Wdh Zusatzgewicht', 'latPull'),
      I('tbar', [W(6, '1:00', '50%'), N(3, '6-10', '2:30')], '1', 'Ellbogen 45°', 'dbRowIncl'),
      I('pulloverM', [W(8, '0:30'), N(2, '10-15', '1:30')], '0-1', '', 'pulloverC'),
      I('revFly', [N(3, '12-20', '1:30')], '0-1', '', 'facePull'),
      I('scottSZ', [W(8, '0:30'), N(3, '6-12', '1:30')], '0-1', '', 'scottDB'),
      I('shrugs', [N(2, '10-15', '1:30')], '1', 'Oben 1 s halten'),
      I('neckExt', [N(2, '15-20', '1:00')], '2', 'Erste 4 Wochen leicht')
    ] },
    { day: 3, name: 'Legs A', items: [
      I('squat', [W(10, 'Aus', 20), W(5, 'Aus', '50%'), W(3, '1:00', '70%'), W(1, '2:30', '85%'), T('3-5', '4:00'), B(2, '5-8', '3:00', 0.875)], '1', 'Sicherheitsstangen', 'smithSquat'),
      I('rdl', [W(5, '1:00', '50%'), N(3, '6-10', '3:00')], '2', 'Nie bis zum Versagen', 'dbRdl'),
      I('legCurlS', [W(8, '0:30'), N(3, '8-12', '1:30')], '0-1', '', 'legCurlL'),
      I('legExt', [W(10, '0:30'), N(3, '10-15', '1:30')], '0-1', 'Lehne nach hinten'),
      I('calfSt', [N(4, '8-12', '1:30')], '0-1', 'Unten 2 s halten', 'calfLP'),
      I('cableCrunch', [N(3, '10-15', '1:00')], '0-1', 'Oben aus der Dehnung starten', 'crunchM')
    ] },
    { day: 4, name: 'Push B', items: [
      I('ohp', [W(8, 'Aus', 20), W(5, '1:00', '50%'), W(2, '2:00', '75%'), N(3, '5-8', '3:00')], '1', '', 'dbOhp'),
      I('smithIncl', [W(5, '0:30', '55%'), N(3, '6-8', '2:30')], '1', '', 'inclineBB'),
      I('flyM', [W(10, '0:30'), N(3, '10-15', '1:30')], '0-1', 'Volle Dehnung', 'cableCross'),
      I('latRaiseM', [N(4, '12-20', '1:30')], '0-1', 'Letzter Satz plus Partials', 'latRaiseC'),
      I('skull', [W(10, '0:30'), N(3, '10-15', '1:30')], '0-1', 'Hinter den Kopf ablassen', 'ropePush'),
      I('neckCurl', [N(2, '15-20', '1:00')], '2', '')
    ] },
    { day: 5, name: 'Pull B', items: [
      I('latPullN', [W(8, 'Aus', '50%'), W(4, '1:00', '75%'), N(3, '8-12', '2:00')], '0-1', '', 'pullup'),
      I('cableRow', [W(6, '0:30', '50%'), N(3, '8-12', '2:00')], '1', '', 'rowM'),
      I('bayesian', [W(8, '0:30'), N(3, '8-15', '1:30')], '0-1', 'Zwischen zwei Kabeltürmen', 'inclCurl'),
      I('revFly', [N(2, '12-20', '1:30')], '0-1', '', 'facePull'),
      I('wristCurl', [N(3, '12-20', 'Aus')], '0-1', 'Supersatz mit nächster Übung', null, { ss: true }),
      I('wristExt', [N(3, '12-20', '1:00')], '0-1', ''),
      I('neckExt', [N(2, '15-20', '1:00')], '2', '')
    ] },
    { day: 6, name: 'Legs B', items: [
      I('deadlift', [W(5, 'Aus', 60), W(3, '1:00', '60%'), W(1, '2:00', '80%'), W(1, '3:00', '90%'), T('2-4', '4:00'), B(1, '4-6', '4:00', 0.85)], '2', 'Nie bis zum Versagen', 'sumo'),
      I('hack', [W(6, '1:00', '50%'), N(3, '6-10', '2:30')], '1', '', 'pendulum'),
      I('hipThrust', [W(6, '1:00', '50%'), N(2, '6-10', '2:00')], '1', 'Oben 1 s halten', 'gluteDrive'),
      I('lunges', [N(2, '10-12', '2:00')], '1-2', '', 'legPress'),
      I('legCurlS', [W(8, '0:30'), N(3, '10-15', '1:30')], '0-1', '', 'legCurlL'),
      I('legExt', [N(2, '12-20', '1:30')], '0', 'Letzter Satz plus Partials'),
      I('calfSt', [N(4, '12-20', '1:30')], '0-1', ''),
      I('crunchM', [N(3, '10-15', '1:00')], '0-1', 'Oben aus der Dehnung starten', 'cableCrunch')
    ] }
  ];

  /**
   * Übernimmt den Plan in den App-Zustand: alte Pläne und Übungen ohne Historie werden gelöscht,
   * Übungen mit Historie bleiben (versteckt). Trainings und Körpergewicht bleiben unberührt.
   */
  function applyProgram(S, uid, now) {
    if (S.settings.seed === SEED_ID) return false;
    const used = new Set(S.workouts.flatMap(w => w.items.map(i => i.exId)));
    S.exercises = S.exercises.filter(e => used.has(e.id)).map(e => Object.assign(e, { archived: true }));
    S.plans = [];
    const ids = {};
    for (const k in EX) {
      const d = EX[k], id = uid();
      ids[k] = id;
      S.exercises.push({ id, name: d.name, mode: 'reps', load: d.load || 'weight', note: '', step: d.step, barbell: !!d.barbell, perLeg: !!d.perLeg, muscles: M({}, d.muscles) });
    }
    for (const day of DAYS) {
      S.plans.push({ id: uid(), name: day.name, day: day.day, items: day.items.map(it => ({
        id: uid(), exId: ids[it.ex], rir: it.rir, note: it.note, alts: it.alts.map(a => ids[a]), ss: !!it.ss,
        sets: it.sets.map(s => Object.assign({}, s, s.kg != null ? { kgAt: now } : {}))
      })) });
    }
    Object.assign(S.settings.cycle, { start: null, reentry: 4, block: 7, firstBlock: 10, deloadStart: null });
    S.settings.deload = { weightPct: 10, repsPct: 0, setsPct: 50 };
    S.settings.deloadOn = false;
    S.settings.seed = SEED_ID;
    return true;
  }

  const P = { SEED_ID, EX, DAYS, applyProgram };
  if (typeof module !== 'undefined' && module.exports) module.exports = P; else root.GL_PROGRAM = P;
})(typeof window !== 'undefined' ? window : globalThis);
