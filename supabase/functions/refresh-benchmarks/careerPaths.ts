/**
 * Career paths per occupation (pure functions, no I/O).
 *
 * From O*NET (CC BY 4.0):
 *   job_zones.csv            how much preparation a job needs (1 little … 5 extensive)
 *   related_occupations.csv  20 related occupations each, tiers Primary-Short /
 *                            Primary-Long / Supplemental (replaced the Career
 *                            Changers Matrix in O*NET 31.0)
 *   transferable_skills.csv  importance (IM, 1–5) and level (LV, 0–7) of each skill
 *
 * Rules (agreed with Amit, 2026-10-19):
 *   advancement   = the first-line supervisor of the job's group (if it pays more),
 *                   or a related job that needs more preparation (higher Job Zone)
 *                   and pays more, or a related job with the same or higher Job
 *                   Zone paying ≥ 20% more — but only when the relation is
 *                   Primary-Short / Primary-Long. A Supplemental-tier job (O*NET
 *                   ranks 11–20) is never a promotion, only a career change
 *                   (decision 2026-10-19; e.g. taxi → truck driver).
 *                   The tier is the one on the current job's own O*NET list.
 *   career_change = any other related job paying more than the job's median
 *   lower_pay     = related jobs paying the same or less (kept for the
 *                   "less physical work" goal; never shown as a move up)
 * Pay = OEWS national median (p50).
 *
 * Limits on how big a leap can be (decisions 2026-10-20, after "registered
 * nurse → psychiatrist"):
 *   - only the current job's OWN O*NET list counts (not jobs that list it)
 *   - only the main O*NET occupation's list (e.g. 29-1141.00), not a
 *     sub-specialty's (29-1141.02 Advanced Practice Psychiatric Nurses), when
 *     O*NET has the main one
 *   - the target needs at most ONE Job Zone more than the current job
 *   - no target where ≥ 50% of O*NET respondents say a first professional,
 *     doctoral or post-doctoral degree is required (education.csv, scale RL 10–12;
 *     jobs without answers use their SOC group's average, e.g. surgeons)
 *   - no target whose national median is more than $100,000 above the current job's
 */
import { parseCsv } from './parseOccupations.ts';

export const ADVANCEMENT_PAY_RATIO = 1.2;
export const SKILL_MIN_IMPORTANCE = 3;      // "important" on O*NET's 1–5 scale
export const SKILL_MIN_GAP = 0.5;           // level points on O*NET's 0–7 scale
export const MAX_SKILL_GAPS = 6;
export const MAX_JOB_ZONE_STEP = 1;
export const MAX_PROF_DEGREE_SHARE = 50;      // % of respondents (RL categories 10–12)
export const MAX_MEDIAN_JUMP = 100_000;       // $ a year, national medians

const TIER_ORDER: Record<string, number> = { 'Primary-Short': 1, 'Primary-Long': 2, Supplemental: 3 };

function header(rows: string[][], file: string, needed: string[]) {
  const h = (rows[0] ?? []).map((x) => x.replace(/^﻿/, '').trim().toLowerCase());
  const ix: Record<string, number> = {};
  for (const n of needed) {
    ix[n] = n === 'code' ? h.findIndex((x) => x.startsWith('o*net-soc code')) : h.indexOf(n);
    if (ix[n] < 0) throw new Error(`Unexpected ${file} header (no "${n}"): ${(rows[0] ?? []).join(' | ').slice(0, 200)}`);
  }
  return ix;
}

/** job_zones.csv → O*NET-SOC code → Job Zone (1–5). */
export function parseJobZones(text: string): Map<string, number> {
  const rows = parseCsv(text);
  const ix = header(rows, 'job_zones.csv', ['code', 'job zone']);
  const out = new Map<string, number>();
  for (const r of rows.slice(1)) {
    const z = Number(r[ix['job zone']]);
    if (z >= 1 && z <= 5) out.set(r[ix.code].trim(), z);
  }
  return out;
}

export interface OnetRelated { from: string; to: string; tier: string; index: number }

/** related_occupations.csv → one row per (occupation, related occupation). */
export function parseRelated(text: string): OnetRelated[] {
  const rows = parseCsv(text);
  const ix = header(rows, 'related_occupations.csv', ['code', 'related o*net-soc code', 'relatedness tier', 'index']);
  return rows.slice(1)
    .map((r) => ({
      from: r[ix.code].trim(), to: r[ix['related o*net-soc code']].trim(),
      tier: r[ix['relatedness tier']].trim(), index: Number(r[ix.index]),
    }))
    .filter((r) => /^\d{2}-\d{4}\.\d{2}$/.test(r.from) && /^\d{2}-\d{4}\.\d{2}$/.test(r.to));
}

/** education.csv (O*NET 31+) → O*NET-SOC code → % of respondents saying a professional / doctoral degree is required */
export function parseProfDegreeShare(text: string): Map<string, number> {
  const rows = parseCsv(text);
  const ix = header(rows, 'education.csv', ['code', 'scale id', 'category', 'data value']);
  const out = new Map<string, number>();
  for (const r of rows.slice(1)) {
    if (r[ix['scale id']].trim() !== 'RL') continue;
    const cat = Number(r[ix.category]), v = Number(r[ix['data value']]);
    const code = r[ix.code].trim();
    if (!out.has(code)) out.set(code, 0);
    if (cat >= 10 && Number.isFinite(v)) out.set(code, out.get(code)! + v);
  }
  return out;
}

/**
 * education.csv → O*NET-SOC code → % of respondents per required level of
 * education (scale RL, index 0..11 = category 1..12: less than high school,
 * high school, post-secondary certificate, some college, associate, bachelor's,
 * post-baccalaureate certificate, master's, post-master's certificate, first
 * professional, doctoral, post-doctoral).
 */
export function parseEducationLevels(text: string): Map<string, number[]> {
  const rows = parseCsv(text);
  const ix = header(rows, 'education.csv', ['code', 'scale id', 'category', 'data value']);
  const out = new Map<string, number[]>();
  for (const r of rows.slice(1)) {
    if (r[ix['scale id']].trim() !== 'RL') continue;
    const cat = Number(r[ix.category]), v = Number(r[ix['data value']]);
    if (!(cat >= 1 && cat <= 12) || !Number.isFinite(v)) continue;
    const code = r[ix.code].trim();
    if (!out.has(code)) out.set(code, new Array(12).fill(0));
    out.get(code)![cat - 1] = v;
  }
  return out;
}

export interface TypicalEducation { level: number; share: number; dist: number[]; codes: string[] }

/** Per OEWS code: the most common required level (1–12) and its share, from the main O*NET code (else averaged) */
export function rollUpEducation(m: Map<string, number[]>, toOews: Mapper): Map<string, TypicalEducation> {
  const out = new Map<string, TypicalEducation>();
  for (const [soc, g] of groupByOews(m, toOews)) {
    const dist = new Array(12).fill(0).map((_, i) => round2(g.values.reduce((s, d) => s + d[i], 0) / g.values.length));
    let level = 1;
    for (let i = 1; i < 12; i++) if (dist[i] > dist[level - 1]) level = i + 1;
    out.set(soc, { level, share: Math.round(dist[level - 1]), dist, codes: g.codes });
  }
  return out;
}

/** Per OEWS code: the main (.00) O*NET code's share, else the average of its detail codes */
export function rollUpShare(m: Map<string, number>, toOews: Mapper) {
  const out = new Map<string, number>();
  for (const [soc, g] of groupByOews(m, toOews)) {
    out.set(soc, Math.round((g.values.reduce((a, b) => a + b, 0) / g.values.length) * 10) / 10);
  }
  return out;
}

export interface SkillRating { im: number; lv: number }

/** transferable_skills.csv (or skills.csv) → O*NET-SOC code → skill name → { importance, level }. */
export function parseSkills(text: string): Map<string, Map<string, SkillRating>> {
  const rows = parseCsv(text);
  const ix = header(rows, 'skills file', ['code', 'element name', 'scale id', 'data value']);
  const iNotRel = (rows[0] ?? []).map((x) => x.trim().toLowerCase()).indexOf('not relevant');
  const out = new Map<string, Map<string, SkillRating>>();
  for (const r of rows.slice(1)) {
    const code = r[ix.code].trim();
    const skill = r[ix['element name']].trim();
    const scale = r[ix['scale id']].trim();
    let v = Number(r[ix['data value']]);
    if (!Number.isFinite(v) || (scale !== 'IM' && scale !== 'LV')) continue;
    if (scale === 'LV' && iNotRel >= 0 && r[iNotRel]?.trim() === 'Y') v = 0;
    if (!out.has(code)) out.set(code, new Map());
    const m = out.get(code)!;
    const cur = m.get(skill) ?? { im: 0, lv: 0 };
    if (scale === 'IM') cur.im = v; else cur.lv = v;
    m.set(skill, cur);
  }
  return out;
}

type Mapper = (onetSoc: string) => string | null;

/** Group O*NET detail codes under OEWS codes; the main (.00) code wins, else codes are averaged. */
function groupByOews<T>(byCode: Map<string, T>, toOews: Mapper) {
  const groups = new Map<string, Array<{ code: string; v: T }>>();
  for (const [code, v] of byCode) {
    const soc = toOews(code);
    if (!soc) continue;
    if (!groups.has(soc)) groups.set(soc, []);
    groups.get(soc)!.push({ code, v });
  }
  const out = new Map<string, { codes: string[]; values: T[] }>();
  for (const [soc, list] of groups) {
    const main = list.filter((x) => x.code === `${soc}.00`);
    const use = main.length ? main : list;
    out.set(soc, { codes: use.map((x) => x.code), values: use.map((x) => x.v) });
  }
  return out;
}

export function rollUpJobZones(jz: Map<string, number>, toOews: Mapper) {
  const out = new Map<string, { zone: number; codes: string[] }>();
  for (const [soc, g] of groupByOews(jz, toOews)) {
    const sorted = [...g.values].sort((a, b) => a - b);
    out.set(soc, { zone: sorted[Math.floor((sorted.length - 1) / 2)], codes: g.codes });   // lower median
  }
  return out;
}

export function rollUpSkills(sk: Map<string, Map<string, SkillRating>>, toOews: Mapper) {
  const out = new Map<string, Map<string, SkillRating>>();
  for (const [soc, g] of groupByOews(sk, toOews)) {
    const sums = new Map<string, { im: number; lv: number; n: number }>();
    for (const m of g.values) for (const [skill, r] of m) {
      const s = sums.get(skill) ?? { im: 0, lv: 0, n: 0 };
      s.im += r.im; s.lv += r.lv; s.n++;
      sums.set(skill, s);
    }
    const avg = new Map<string, SkillRating>();
    for (const [skill, s] of sums) avg.set(skill, { im: round2(s.im / s.n), lv: round2(s.lv / s.n) });
    out.set(soc, avg);
  }
  return out;
}

export interface RelatedPair {
  soc: string; target: string; tier: string; rank: number; direction: 'listed' | 'reverse';
  /** Tier on the current job's own O*NET list (null when only the target lists the current job) */
  listedTier?: string | null;
}

/**
 * Related pairs in OEWS codes, from each job's own O*NET list only (relatedness
 * is one-way: psychiatrists list psychiatric nurses, nurses don't list
 * psychiatrists — 2026-10-20). Per pair the best tier wins.
 */
export function relatedPairs(rel: OnetRelated[], toOews: Mapper): RelatedPair[] {
  // Each job's OWN list only, read from its main O*NET code when O*NET has one
  // (a sub-specialty's links don't speak for the whole job)
  const hasMain = new Set<string>();
  for (const r of rel) { const a = toOews(r.from); if (a && r.from === `${a}.00`) hasMain.add(a); }
  rel = rel.filter((r) => { const a = toOews(r.from); return !!a && (!hasMain.has(a) || r.from === `${a}.00`); });
  const best = new Map<string, RelatedPair>();
  const consider = (p: RelatedPair) => {
    if (p.soc === p.target) return;
    const k = `${p.soc}|${p.target}`;
    const cur = best.get(k);
    const score = (x: RelatedPair) => (TIER_ORDER[x.tier] ?? 9) * 1000 + (x.direction === 'reverse' ? 500 : 0) + x.rank;
    if (!cur || score(p) < score(cur)) best.set(k, p);
  };
  const listed = new Map<string, string>();
  for (const r of rel) {
    const a = toOews(r.from), b = toOews(r.to);
    if (!a || !b) continue;
    consider({ soc: a, target: b, tier: r.tier, rank: r.index, direction: 'listed' });
    const k = `${a}|${b}`, cur = listed.get(k);
    if (!cur || (TIER_ORDER[r.tier] ?? 9) < (TIER_ORDER[cur] ?? 9)) listed.set(k, r.tier);
  }
  return [...best.values()].map((p) => ({ ...p, listedTier: listed.get(`${p.soc}|${p.target}`) ?? null }));
}

export interface SupervisorRule { prefix: string; supervisor_soc: string }

/** Longest matching SOC prefix → that group's first-line supervisor. */
export function makeSupervisorOf(rules: SupervisorRule[]) {
  const sorted = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
  return (soc: string) => {
    const r = sorted.find((x) => soc.startsWith(x.prefix));
    return r && r.supervisor_soc !== soc ? r.supervisor_soc : null;
  };
}

export interface SkillGap { skill: string; gap: number }

export function skillGaps(from?: Map<string, SkillRating>, to?: Map<string, SkillRating>): SkillGap[] | null {
  if (!from?.size || !to?.size) return null;
  const out: SkillGap[] = [];
  for (const [skill, t] of to) {
    if (t.im < SKILL_MIN_IMPORTANCE) continue;
    const gap = t.lv - (from.get(skill)?.lv ?? 0);
    if (gap >= SKILL_MIN_GAP) out.push({ skill, gap: round2(gap) });
  }
  return out.sort((a, b) => b.gap - a.gap).slice(0, MAX_SKILL_GAPS);
}

export interface CareerLink {
  soc: string; target_soc: string;
  kind: 'advancement' | 'career_change' | 'lower_pay';
  basis: string[];                      // supervisor | job_zone | pay | related
  related_tier: string | null; related_rank: number | null; direction: string | null;
  job_zone_from: number | null; job_zone_to: number | null;
  median_from: number; median_to: number; pay_ratio: number;
  skill_gaps: SkillGap[] | null;
}

export function computeLinks(input: {
  socs: Iterable<string>;
  pairs: RelatedPair[];
  zones: Map<string, number>;
  medians: Map<string, number>;
  skills: Map<string, Map<string, SkillRating>>;
  supervisorOf: (soc: string) => string | null;
  /** % of respondents saying a professional / doctoral degree is required (O*NET) */
  profDegree?: Map<string, number>;
}): CareerLink[] {
  const { zones, medians, skills } = input;
  const profDegree = input.profDegree ?? new Map<string, number>();
  // O*NET has no education answers for some specialties (e.g. cardiologists):
  // use the average of the same SOC group (first 5 characters, e.g. '29-12')
  const groupSums = new Map<string, { sum: number; n: number }>();
  for (const [soc, v] of profDegree) {
    const g = groupSums.get(soc.slice(0, 5)) ?? { sum: 0, n: 0 };
    g.sum += v; g.n++; groupSums.set(soc.slice(0, 5), g);
  }
  const degreeShare = (soc: string) => {
    const own = profDegree.get(soc);
    if (own != null) return own;
    const g = groupSums.get(soc.slice(0, 5));
    return g ? g.sum / g.n : 0;
  };
  const bySoc = new Map<string, RelatedPair[]>();
  for (const p of input.pairs) {
    if (!bySoc.has(p.soc)) bySoc.set(p.soc, []);
    bySoc.get(p.soc)!.push(p);
  }
  const out: CareerLink[] = [];
  for (const soc of input.socs) {
    const mf = medians.get(soc);
    if (!mf) continue;
    const zf = zones.get(soc) ?? null;
    const seen = new Set<string>();
    const sup = input.supervisorOf(soc);
    const candidates: Array<{ target: string; pair: RelatedPair | null }> = [];
    if (sup) candidates.push({ target: sup, pair: (bySoc.get(soc) ?? []).find((p) => p.target === sup) ?? null });
    for (const p of bySoc.get(soc) ?? []) candidates.push({ target: p.target, pair: p });
    for (const { target, pair } of candidates) {
      if (seen.has(target) || target === soc) continue;
      seen.add(target);
      const mt = medians.get(target);
      if (!mt) continue;
      const zt = zones.get(target) ?? null;
      // Too big a leap: more than one Job Zone up, a professional / doctoral degree, or far higher pay
      if (zf != null && zt != null && zt > zf + MAX_JOB_ZONE_STEP) continue;
      if (degreeShare(target) >= MAX_PROF_DEGREE_SHARE) continue;
      if (mt - mf > MAX_MEDIAN_JUMP) continue;
      const ratio = mt / mf;
      const basis: string[] = [];
      // Supplemental-tier relations are never promotions (the job's own list decides)
      const promotable = !!pair && (pair.listedTier ?? pair.tier) !== 'Supplemental';
      if (target === sup && ratio > 1) basis.push('supervisor');
      if (promotable && zf != null && zt != null && zt > zf && ratio > 1) basis.push('job_zone');
      if (promotable && (zf == null || zt == null || zt >= zf) && ratio >= ADVANCEMENT_PAY_RATIO) basis.push('pay');
      let kind: CareerLink['kind'];
      if (basis.length) kind = 'advancement';
      else if (!pair) continue;                         // a supervisor job that doesn't pay more
      else kind = ratio > 1 ? 'career_change' : 'lower_pay';
      if (pair) basis.push('related');
      out.push({
        soc, target_soc: target, kind, basis,
        related_tier: pair ? pair.listedTier ?? pair.tier : null, related_rank: pair?.rank ?? null, direction: pair?.direction ?? null,
        job_zone_from: zf, job_zone_to: zt,
        median_from: mf, median_to: mt, pay_ratio: round2(ratio),
        skill_gaps: skillGaps(skills.get(soc), skills.get(target)),
      });
    }
  }
  return out;
}

function round2(x: number) { return Math.round(x * 100) / 100; }
