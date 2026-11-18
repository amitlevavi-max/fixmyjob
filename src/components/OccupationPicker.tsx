import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { occupationBySoc, CATEGORY_OCCUPATIONS } from '../data/blsOews';
import { searchOccupations, fetchOccupationBySoc, OccupationHit } from '../lib/occupationSearch';
import OptionCard from './OptionCard';
import TextField from './TextField';
import SectionLabel from './SectionLabel';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

export const NO_MATCH = 'none';

interface Props {
  /** What the user typed (may be empty) */
  query: string;
  /** "Line of work" chip they picked, if any */
  category?: string;
  /** Selected SOC code, NO_MATCH, or null (nothing chosen yet) */
  selected: string | null;
  onSelect: (soc: string | null) => void;
  /** Text in the "describe it" box (kept by the parent) */
  text: string;
  onTextChange: (t: string) => void;
  /** Offer "None of these — keep my words" (onboarding). Default true. */
  allowNone?: boolean;
  /** Show at most this many matches at first (the rest behind "Show more"), so the box fits on small screens */
  maxHits?: number;
  /** Bottom of the "describe your job" box, relative to the picker's top */
  onFieldBottom?: (y: number) => void;
  /** Number of matches found */
  onHitsCount?: (n: number) => void;
}

/**
 * "Which is closest to your job?" — shown when what the user typed doesn't
 * clearly match one BLS occupation. Searches every BLS occupation and ~57k
 * everyday job titles, offers the closest (up to 6), a box to describe the job
 * differently (re-searches as they type), and a "none of these" option.
 */
export default function OccupationPicker({ query, category, selected, onSelect, text, onTextChange, allowNone = true, maxHits = 6, onFieldBottom, onHitsCount }: Props) {
  const typed = (text || query).trim();
  const [hits, setHits] = useState<OccupationHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { onHitsCount?.(hits.length); }, [hits.length]);
  // A picked match always stays visible
  const pickedAt = hits.findIndex((h) => h.occ.soc === selected);
  const limit = showAll ? hits.length : Math.max(maxHits, pickedAt + 1);
  const shown = hits.slice(0, limit);
  const hidden = hits.length - shown.length;

  useEffect(() => {
    let alive = true;
    // The chip's occupations: bundled ones at once, the rest from the database
    const categoryHits = async (): Promise<OccupationHit[]> => {
      const socs = CATEGORY_OCCUPATIONS[category ?? ''] ?? [];
      const occs = await Promise.all(
        socs.map((soc) => occupationBySoc(soc) ?? fetchOccupationBySoc(soc).catch(() => null)),
      );
      return occs
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((occ) => ({ occ, score: 0, hasLiveWages: false }));
    };
    setSearching(true);
    if (typed.length < 2) {
      categoryHits().then((h) => { if (alive) { setHits(h); setSearching(false); } });
      return () => { alive = false; };
    }
    // Debounce typing; first search (from the previous screen) runs at once
    const t = setTimeout(async () => {
      const res = await searchOccupations(typed, 6);
      if (!alive) return;
      const seen = new Set<string>();
      const out: OccupationHit[] = [];
      for (const h of [...res.hits, ...(await categoryHits())]) {
        if (!seen.has(h.occ.soc) && out.length < 6) { seen.add(h.occ.soc); out.push(h); }
      }
      setHits(out);
      setSearching(false);
    }, text ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [typed, category]);

  return (
    <View>
      {hits.length > 0 ? (
        <View style={styles.list}>
          {shown.map(({ occ, matchedTitle, suggested }) => (
            <OptionCard
              key={occ.soc}
              title={t(occ.title)}
              subtitle={[
                suggested ? t('Suggested from what you typed') : null,
                matchedTitle ? t('Includes "{title}"', { title: matchedTitle }) : null,
                t('US median {amount}/yr', { amount: `$${Math.round(occ.p50).toLocaleString()}` }),
              ].filter(Boolean).join(' · ')}
              compact
              selected={selected === occ.soc}
              onPress={() => onSelect(occ.soc)}
            />
          ))}
        </View>
      ) : searching ? (
        <ActivityIndicator color={Colors.accent} style={{ marginVertical: 18 }} />
      ) : (
        <Text style={styles.empty}>
          {typed
            ? t('We couldn\'t find a close match for "{typed}". Try describing it differently below.', { typed })
            : t('We couldn\'t find a close match. Try describing it differently below.')}
        </Text>
      )}

      <View onLayout={(e) => onFieldBottom?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        <SectionLabel>{t('Not listed? Describe your job')}</SectionLabel>
        <TextField
          icon="f:search"
          placeholder={t('e.g. dishwasher, picker, home aide…')}
          value={text}
          onChangeText={(v) => { onTextChange(v); if (selected && selected !== NO_MATCH) onSelect(null); }}
          autoCorrect={false}
        />
      </View>
      {allowNone && typed.length > 1 && (
        <OptionCard
          title={t('None of these — keep "{typed}"', { typed })}
          subtitle={t('We\'ll compare you with US workers overall')}
          compact
          selected={selected === NO_MATCH}
          onPress={() => onSelect(NO_MATCH)}
          style={{ marginTop: 10 }}
        />
      )}
      {hidden > 0 && (
        <TouchableOpacity onPress={() => setShowAll(true)} style={styles.more} activeOpacity={0.7}>
          <Text style={styles.moreText}>{hidden === 1 ? t('Show 1 more match') : t('Show {n} more matches', { n: hidden })}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, marginBottom: 6 },
  more: { paddingVertical: 12, alignSelf: 'flex-start' },
  moreText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentHi },
  empty: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20, marginBottom: 8 },
});
