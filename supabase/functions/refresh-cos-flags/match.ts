// Matching a credential record to a CareerOneStop (COS) Certification Finder record.
// Rules come from the 2026-11-18 test against the COS flag file (see claude/careeronestop-certifications.md):
//  - issuer must agree (names that only look alike from different issuers are different credentials);
//  - exact name after light cleaning, or the COS acronym given in brackets in our name;
//  - no fuzzy matching (it paired siblings: Scrum Master I vs II, CCRN Adult vs Pediatric).

export type CosCert = {
  Id: string;
  Name: string;
  Acronym?: string | null;
  Organization?: string | null;
  CertAccredAgencyList?: { Name: string }[] | null;
};

export type Credential = { id: string; name: string; issuer: string | null };

export type Match = { cert: CosCert; method: 'exact' | 'acronym' };

// Remove ®/™, acronym-only brackets like "(CW)" or "(COTA®)" (brackets with lowercase words, e.g. "(Adult)",
// are kept), a trailing code like " - PBT(ASCP)" or " - RN", and the words "certified"/"certification".
export function nameKey(s: string): string {
  let t = (s ?? '').replace(/[®™]/g, '');
  t = t.replace(/\(([^)]*)\)/g, (m, inner: string) => (/[a-z]/.test(inner) ? m : ' '));
  t = t.replace(/\s+-\s+[A-Z0-9][A-Z0-9/.+&-]{0,9}\s*$/, ' ');
  t = t.toLowerCase().replace(/\b(certified|certification)\b/g, ' ');
  return t.replace(/[^a-z0-9]+/g, '');
}

function acronymKey(s: string | null | undefined): string {
  return (s ?? '').replace(/[®™]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

// Acronyms given in brackets in our credential name: "Certified Welder (CW)" -> ["CW"].
export function bracketAcronyms(name: string): string[] {
  const out: string[] = [];
  for (const m of (name ?? '').matchAll(/\(([^)]*)\)/g)) {
    if (!/[a-z]/.test(m[1])) {
      const k = acronymKey(m[1]);
      if (k) out.push(k);
    }
  }
  return out;
}

const ORG_STOP = new Set(['inc', 'the', 'llc', 'ltd', 'corporation', 'corp', 'co', 'of', 'for', 'and', 'in', 'on']);

export function orgTokens(s: string | null | undefined): string[] {
  const t = (s ?? '')
    .toLowerCase()
    .replace(/\(isc\)\s*[²2]/g, ' isc2 ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ');
  return t.split(/\s+/).filter((w) => w && !ORG_STOP.has(w));
}

const ALIASES: [RegExp, RegExp][] = [
  [/^ana enterprise$/i, /american nurses/i],
  [/microsoft|cisco|comptia/i, /certiport/i],
  [/international information systems security certification consortium/i, /isc\)?\s*[²2]|isc2/i],
];

export function issuerOk(cosOrg: string | null | undefined, ourIssuer: string | null | undefined): boolean {
  const a = orgTokens(cosOrg);
  const b = orgTokens(ourIssuer);
  if (!a.length || !b.length) return false;
  const sa = a.join(' ');
  const sb = b.join(' ');
  if (sa === sb) return true;
  if (sa.length >= 3 && sb.length >= 3 && (sa.includes(sb) || sb.includes(sa))) return true;
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  if (inter / new Set([...A, ...B]).size >= 0.5) return true;
  return ALIASES.some(([x, y]) => x.test(cosOrg ?? '') && y.test(ourIssuer ?? ''));
}

export function findMatches(cred: Credential, certs: CosCert[]): Match[] {
  const key = nameKey(cred.name);
  const ours = bracketAcronyms(cred.name);
  const wholeName = acronymKey(cred.name);
  const out: Match[] = [];
  for (const c of certs) {
    if (!issuerOk(c.Organization, cred.issuer)) continue;
    if (key && nameKey(c.Name) === key) {
      out.push({ cert: c, method: 'exact' });
      continue;
    }
    const acr = acronymKey(c.Acronym);
    if (acr.length >= 3 && (ours.includes(acr) || wholeName === acr)) out.push({ cert: c, method: 'acronym' });
  }
  return out.sort((x, y) => (x.method === y.method ? 0 : x.method === 'exact' ? -1 : 1));
}

export function tagsOf(c: CosCert): string[] {
  return (c.CertAccredAgencyList ?? []).map((t) => t.Name).filter(Boolean);
}

// Text for the API's keyword path segment (no characters that break a URL path).
export function keywordFor(name: string): string {
  const t = (name ?? '')
    .replace(/[®™]/g, '')
    .replace(/\(([^)]*)\)/g, (m, inner: string) => (/[a-z]/.test(inner) ? m : ' '))
    .replace(/\s+-\s+[A-Z0-9][A-Z0-9/.+&-]{0,9}\s*$/, ' ')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.slice(0, 120);
}
