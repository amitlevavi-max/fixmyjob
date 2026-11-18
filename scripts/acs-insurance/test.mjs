/**
 * Checks for lib.mjs with a made-up population (no Census API needed):
 *   node scripts/acs-insurance/test.mjs
 * Also used by fake-census.mjs to answer the import script's API calls offline.
 */
import assert from 'node:assert/strict';
import {
  SET_A, SET_B, AGE_CHUNKS, ESR_VALUES, newStateTotals, addChunk, finishState, usRows,
  bandEdges, bandOfBin, binOf, occCode, hourlyPay, estimate, newAcc, addPerson, MAX_BIN, unmatched,
} from './lib.mjs';

/** Deterministic random numbers */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Insured share by occupation in the fake data (the truth to recover) */
export const TRUTH = { '3255': 0.85, '9620': 0.55, '4720': 0.40 };
const SOC = { '3255': '291141', '9620': '537062', '4720': '412011' };

/** A fake state: people with occupation, class of worker, pay, insurance and weights */
export function fakePeople(stateSeed, count) {
  const r = rng(stateSeed);
  const occs = Object.keys(TRUTH);
  const people = [];
  for (let i = 0; i < count; i++) {
    const occ = occs[Math.floor(r() * occs.length)];
    const base = { '3255': 40, '9620': 17, '4720': 14 }[occ];
    const hourly = base * (0.6 + r() * 0.8);
    const hours = 20 + Math.floor(r() * 25), weeks = 30 + Math.floor(r() * 23);
    const w = 10 + Math.floor(r() * 30);
    const reps = Array.from({ length: 80 }, () => Math.round(w * (0.5 + r())));
    // better-paid people a bit more often insured, around the truth
    const pIns = Math.min(0.98, TRUTH[occ] + (hourly / base - 1) * 0.2);
    people.push({
      SERIALNO: `2022HU${String(stateSeed).padStart(3, '0')}${String(i).padStart(7, '0')}`, SPORDER: '1',
      PWGTP: String(w), HINS1: r() < pIns ? '1' : '2', OCCP: occ, SOCP: SOC[occ],
      WAGP: String(Math.round(hourly * hours * weeks)), WKHP: String(hours), WKWN: String(weeks),
      ADJINC: '1.000000', COW: String(r() < 0.9 ? 1 + Math.floor(r() * 5) : 6 + Math.floor(r() * 2)),
      ESR: r() < 0.95 ? '1' : '2', AGEP: String(18 + Math.floor(r() * 47)),
      reps,
    });
  }
  return people;
}

/** What the Census API would answer for one call */
export function fakeAnswer(people, vars, esr, ages, fips) {
  const rows = people.filter((p) => p.ESR === esr && Number(p.AGEP) >= ages[0] && Number(p.AGEP) <= ages[1]);
  if (!rows.length) return null;                          // the API answers 204 No Content
  const val = (p, v) => { const m = v.match(/^PWGTP(\d+)$/); return m ? String(p.reps[Number(m[1]) - 1]) : p[v]; };
  return [[...vars, 'ESR', 'AGEP', 'state'], ...rows.map((p) => [...vars.map((v) => val(p, v)), p.ESR, p.AGEP, fips])];
}

// ── Tests (only when run directly) ──────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('test.mjs')) {
  assert.equal(SET_A.length, 50);
  assert.equal(SET_B.length, 43);
  assert.equal(occCode('325'), '0325');
  assert.equal(occCode('9920'), null);
  assert.equal(occCode('N/A'), null);
  assert.equal(occCode('0009'), null);
  assert.equal(hourlyPay('41600', '1000000', '40', '52'), 20);
  assert.equal(hourlyPay('0', '1000000', '40', '52'), null);
  assert.equal(Math.round(hourlyPay('41600', '1050000', '40', '52') * 100), 2100);
  assert.equal(Math.round(hourlyPay('41600', '1.05', '40', '52') * 100), 2100);   // API format
  assert.equal(Math.round(hourlyPay('41600', '1.050000', '40', '52') * 100), 2100);

  // Edges and bands agree with the SQL function (1 + edges at or below the pay)
  const bw = new Float64Array(MAX_BIN + 1);
  for (const [h, wt] of [[10, 25], [15, 25], [20, 25], [30, 25]]) bw[binOf(h)] += wt;
  const edges = bandEdges(bw);
  assert.deepEqual(edges, [10.5, 15.5, 20.5]);
  const sqlBand = (h) => 1 + edges.filter((e) => h >= e).length;
  for (const h of [9.99, 10, 10.49, 10.5, 15.2, 15.5, 20.49, 20.5, 31, 250]) {
    assert.equal(bandOfBin(binOf(h), edges), sqlBand(h), `band of $${h}`);
  }

  // Margin of error: identical replicates → 0
  const a = newAcc();
  const w = new Float64Array(81).fill(10);
  for (let i = 0; i < 200; i++) addPerson(a, w, i % 4 !== 0);
  const e = estimate(a);
  assert.equal(e.pct, 0.75); assert.equal(e.moe, 0); assert.equal(e.reliable, true);

  // A fake state through the whole chain
  const people = fakePeople(39, 20000);
  const t = newStateTotals();
  for (const esr of ESR_VALUES) for (const ages of AGE_CHUNKS) {
    addChunk(t, fakeAnswer(people, SET_A, esr, ages, '39'), fakeAnswer(people, SET_B, esr, ages, '39'));
  }
  const employees = people.filter((p) => Number(p.COW) <= 5);
  assert.equal(t.people, employees.length);
  const done = finishState(t, 'OH', '2020-2024');
  for (const [occ, truth] of Object.entries(TRUTH)) {
    const row = done.rows.find((x) => x.level === 'state_occ' && x.occ === occ);
    const sample = employees.filter((p) => p.OCCP === occ);
    const exact = sample.reduce((s, p) => s + (p.HINS1 === '1' ? Number(p.PWGTP) : 0), 0) / sample.reduce((s, p) => s + Number(p.PWGTP), 0);
    assert.ok(Math.abs(row.pct - exact) < 1e-4, `weighted share ${occ}: ${row.pct} vs ${exact}`);
    assert.ok(Math.abs(row.pct - truth) < 0.06, `close to the truth ${occ}: ${row.pct} vs ${truth}`);
    assert.ok(row.moe > 0 && row.moe < 0.1, `moe ${occ}: ${row.moe}`);
    assert.equal(row.n, sample.length);
  }
  const bands = done.rows.filter((x) => x.level === 'state_occ_band');
  assert.ok(bands.length >= 8, 'band rows');
  const nurseBands = bands.filter((x) => x.occ === '3255').reduce((s, x) => s + x.n, 0);
  assert.equal(nurseBands, employees.filter((p) => p.OCCP === '3255').length, 'every nurse in one band');
  const groups = done.rows.filter((x) => x.level === 'state_group').map((x) => x.occ).sort();
  assert.deepEqual(groups, ['29', '41', '53']);
  assert.equal(done.edges.length, 3);
  assert.ok(done.edges[0] < done.edges[1] && done.edges[1] < done.edges[2]);

  // US rows add the states up
  const t2 = newStateTotals();
  const people2 = fakePeople(56, 3000);
  for (const esr of ESR_VALUES) for (const ages of AGE_CHUNKS) {
    addChunk(t2, fakeAnswer(people2, SET_A, esr, ages, '56'), fakeAnswer(people2, SET_B, esr, ages, '56'));
  }
  const d2 = finishState(t2, 'WY', '2020-2024');
  const us = usRows([done.occTotals, d2.occTotals], '2020-2024');
  const usNurse = us.find((x) => x.occ === '3255');
  const ohN = done.rows.find((x) => x.level === 'state_occ' && x.occ === '3255').n;
  const wyN = d2.rows.find((x) => x.level === 'state_occ' && x.occ === '3255').n;
  assert.equal(usNurse.n, ohN + wyN);
  assert.equal(usNurse.state, 'US');

  // Missing replicate weights are an error, not a silent skip
  const ansA = fakeAnswer(people2, SET_A, '1', [18, 22], '56');
  const ansB = fakeAnswer(people2, SET_B, '1', [18, 22], '56').slice(0, 2);
  assert.throws(() => addChunk(newStateTotals(), ansA, ansB), /replicate weights/);
  const gap = unmatched(ansA, ansB);
  assert.ok(gap.missing > 0 && gap.missing < gap.employees, 'unmatched counts the gap');
  assert.deepEqual(unmatched(ansA, fakeAnswer(people2, SET_B, '1', [18, 22], '56')).missing, 0);
  assert.equal(unmatched(ansA, []).missing, unmatched(ansA, []).employees, 'empty second answer = all missing');
  const tSkip = newStateTotals();
  const addedSkip = addChunk(tSkip, ansA, ansB, { skipMissing: true });
  assert.equal(addedSkip + tSkip.skipped, gap.employees);

  console.log('All ACS checks passed.');
  console.log('OH sample:', done.rows.filter((x) => x.level !== 'state_occ_band').map((x) => `${x.level}:${x.occ} ${x.pct} ±${x.moe} n=${x.n} ${x.reliable ? 'reliable' : ''}`).join(' | '));
  console.log('OH bands $/hr:', done.edges.join(', '));
}
