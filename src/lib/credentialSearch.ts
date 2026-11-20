/**
 * Search any certification / license to mark as held (Profile → Certifications I have; Amit, 2026-11-19).
 * Database function search_credentials(): Credential Engine + CareerOneStop records, licenses only for the
 * user's state, the user's own job's certifications first; matches names, issuers and acronyms (bls, cna, cdl).
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface CredentialHit {
  id: string; name: string; issuer: string | null; kind: string; state: string | null;
  in_demand: boolean; for_job: boolean;
}

export function useCredentialSearch(q: string, state: string | null, soc: string | null) {
  const [hits, setHits] = useState<CredentialHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setHits([]); setSearching(false); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_credentials', { q: query, p_state: state, p_soc: soc, lim: 8 });
      if (!alive) return;
      setHits(error || !data ? [] : (data as CredentialHit[]));
      setSearching(false);
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, state, soc]);
  return { hits, searching };
}
