/**
 * College programs that lead to the target job of a promotion / career change,
 * at the education level the job usually needs (lib/careerData.fetchDegreeOptions).
 *
 * One list (Amit, 2026-10-20): every program that is fully online or within
 * 100 miles of the user's ZIP / metro (200 miles of the middle of their state
 * when we only know the state), cheapest tuition first, 10 at a time.
 *
 * Which schools award the program: IPEDS Completions (NCES). Earnings after
 * graduating: College Scorecard — reported for the program
 * FAMILY at that school (e.g. "Registered Nursing, Nursing Administration…"
 * for a nurse-midwifery master's), so the card says so. Tuition: IPEDS
 * (school-wide graduate or undergraduate rate, labelled as tuition so it is
 * not read as pay). Student debt is not shown (Amit, 2026-10-20). There is no national data on
 * program length or completion / exam pass rates for these programs.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import Card from './Card';
import Icon from './Icon';
import Notice from './Notice';
import SectionLabel from './SectionLabel';
import { Colors, Fonts } from '../theme';
import { fetchDegreeOptions, DegreeOptions, DegreeProgram, DEGREE_SOURCE } from '../lib/careerData';
import { t, tSource } from '../i18n';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const NOT_REPORTED = () => t('Not reported');
const AWARD: Record<DegreeProgram['award_level'], string> = {
  associate: 'Associate degree', bachelor: "Bachelor's degree", post_bacc_cert: 'Post-baccalaureate certificate',
  master: "Master's degree", post_master_cert: "Post-master's certificate",
  doctor_professional: 'Professional doctorate', doctor_research: 'Doctorate', doctor_other: 'Doctorate',
};
const LEVEL_PLURAL: Record<number, string> = {
  5: 'associate degree programs', 6: "bachelor's degree programs", 7: 'post-baccalaureate certificates',
  8: "master's degree programs", 9: "post-master's certificates", 10: 'professional degree programs', 11: 'doctoral programs',
};

interface Props {
  soc: string;
  /** Short job name for headings, e.g. "nurse midwives" */
  who: string;
  /** O*NET education level the job usually needs (5 associate … 11 doctoral) */
  level: number;
  state: string | null;
  stateName?: string | null;
  point?: { lat: number; lon: number } | null;
}

const PAGE = 10;

export default function DegreePrograms({ soc, who, level, state, stateName, point }: Props) {
  const [data, setData] = useState<DegreeOptions | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // The level itself plus the next one (e.g. master's + post-master's certificate)
  const maxLevel = level >= 8 ? level + 1 : level;

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setShown(PAGE);
    fetchDegreeOptions(soc, level, maxLevel, state, point).then((d) => {
      if (!alive) return;
      setData(d);
      setStatus(d ? 'ready' : 'error');
    });
    return () => { alive = false; };
  }, [soc, level, state, point?.lat, point?.lon]);

  if (status === 'loading') {
    return (
      <Card style={styles.loading}>
        <ActivityIndicator color={Colors.accent} size="small" />
        <Text style={styles.muted}>{t('Looking up college programs…')}</Text>
      </Card>
    );
  }
  if (status === 'error' || !data) {
    return <Notice tone="info">{t('College program data isn\'t available right now — please try again later.')}</Notice>;
  }
  if (!data.summary.nationwide) {
    return <Notice tone="info">{t('No college programs that lead to this job are listed yet.')}</Notice>;
  }
  const s = data.summary;
  const kind = t(LEVEL_PLURAL[level] ?? 'college programs');
  return (
    <View style={{ marginBottom: 8 }}>
      <SectionLabel icon="school-outline">{t('College programs for {who}', { who })}</SectionLabel>
      <Text style={styles.summary}>
        {s.total ? where(s, kind, stateName) : noneNear(s, kind, stateName)}
        {s.total && s.median_earn_1yr ? ` ${t('Graduates typically earn {pay} a year one year after finishing.', { pay: money(s.median_earn_1yr) })}` : ''}
      </Text>

      {data.programs.slice(0, shown).map((p) => <DegreeCard key={p.id} p={p} radius={s.radius_mi} />)}
      {data.programs.length > shown && (
        <TouchableOpacity onPress={() => setShown((n) => n + PAGE)} activeOpacity={0.7} style={styles.more}>
          <Text style={styles.moreText}>{t('Show {n} more', { n: Math.min(PAGE, data.programs.length - shown) })}</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.source}>
        {`${t('Source: {source}', { source: tSource(DEGREE_SOURCE) })}${s.data_year ? ` (${s.data_year})` : ''}. ${t('Tuition & fees are what the school charges for one year of study, for all its students at this level; the program\'s own price and the total for the whole degree can be higher — ask the school. Earnings are for the school\'s whole program family at this level (federal tax records). Program length and pass rates aren\'t published nationally.')}`}
      </Text>
    </View>
  );
}

/** "12 master's degree programs you can do online or within 100 miles of you. Cheapest tuition first." */
function where(s: DegreeOptions['summary'], kind: string, stateName?: string | null) {
  const head = s.centre === 'point'
    ? t('{n} {kind} you can do online or within {mi} miles of you.', { n: s.total, kind, mi: s.radius_mi ?? 100 })
    : s.centre === 'state'
      ? t('{n} {kind} you can do online or within {mi} miles of the middle of {state}.', { n: s.total, kind, mi: s.radius_mi ?? 200, state: stateName ?? '' })
      : t('{n} {kind} you can do fully online.', { n: s.total, kind });
  return `${head} ${t('Cheapest tuition first.')}`;
}
function noneNear(s: DegreeOptions['summary'], kind: string, stateName?: string | null) {
  return s.centre === 'point'
    ? t('None of the {n} {kind} that lead to this job is online or within {mi} miles of you.', { n: s.nationwide, kind, mi: s.radius_mi ?? 100 })
    : t('None of the {n} {kind} that lead to this job is online or within {mi} miles of the middle of {state}. Add your ZIP code to search from where you live.', { n: s.nationwide, kind, mi: s.radius_mi ?? 200, state: stateName ?? '' });
}

function DegreeCard({ p, radius }: { p: DegreeProgram; radius: number | null }) {
  const tuition = p.tuition;
  const tuitionBasis = p.tuition_basis === 'in_state' ? t('in-state') : p.tuition_basis === 'out_of_state' ? t('out-of-state') : '';
  // Distance only for schools in the search area (an online school far away just shows its city)
  const near = p.distance_mi != null && radius != null && p.distance_mi <= radius;
  const rows: Array<[string, string]> = [
    [t('Earnings 1 year after'), p.earn_1yr != null ? `${money(p.earn_1yr)}${t('/yr')}` : NOT_REPORTED()],
    [t('Earnings 5 years after'), p.earn_5yr != null ? `${money(p.earn_5yr)}${t('/yr')}` : NOT_REPORTED()],
    [t('Graduates last year'), p.graduates != null ? String(p.graduates) : NOT_REPORTED()],
  ];
  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{p.school}</Text>
          <Text style={styles.provider}>{`${t(AWARD[p.award_level])}${p.cip_title ? ` · ${p.cip_title}` : ''}`}</Text>
        </View>
        <View style={styles.costBox}>
          <Text style={styles.costCaption}>{t('Tuition & fees')}</Text>
          <Text style={styles.cost}>{tuition != null ? money(tuition) : '—'}</Text>
          <Text style={styles.costLabel}>{tuition != null
            ? [t('per year'), tuitionBasis].filter(Boolean).join(' · ')
            : t('not reported')}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        {(p.city || p.state) && (
          <View style={styles.metaItem}>
            <Icon name="f:map-pin" size={12} color={Colors.slate} />
            <Text style={styles.metaText}>{[p.city, p.state].filter(Boolean).join(', ') + (near ? ` · ${p.distance_mi} mi` : '')}</Text>
          </View>
        )}
        {p.online && (
          <View style={styles.metaItem}>
            <Icon name="f:monitor" size={12} color={Colors.slate} />
            <Text style={styles.metaText}>{t(p.online === 'full' ? 'Fully online' : 'Partly online')}</Text>
          </View>
        )}
      </View>
      <View style={styles.rows}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.rowKey}>{k}</Text>
            <Text style={[styles.rowVal, v === NOT_REPORTED() && styles.rowNone]}>{v}</Text>
          </View>
        ))}
      </View>
      {p.earnings_field && (p.earn_1yr != null || p.earn_5yr != null)
        ? <Text style={styles.base}>{t('Earnings: {field} at this school', { field: p.earnings_field })}</Text> : null}
      {p.url && (
        <TouchableOpacity onPress={() => Linking.openURL(p.url!)} activeOpacity={0.7} style={styles.urlRow}>
          <Icon name="f:external-link" size={12} color={Colors.primaryOnDark} />
          <Text style={styles.link}>{p.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muted: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.muted },
  summary: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20, marginBottom: 10 },
  more: { alignItems: 'center', paddingVertical: 10, marginBottom: 6 },
  moreText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentHi },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 20 },
  provider: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17 },
  // Neutral colour: this is a cost, not pay
  costBox: { alignItems: 'flex-end' },
  costCaption: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cost: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text },
  costLabel: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.faint },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.slate },
  rows: { marginTop: 10, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowKey: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.muted },
  rowVal: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.text, flexShrink: 1, textAlign: 'right' },
  rowNone: { fontFamily: Fonts.regular, color: Colors.faint },
  base: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 8 },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  link: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.primaryOnDark, textDecorationLine: 'underline' },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, lineHeight: 16, marginTop: 4 },
});
