/**
 * Approved training programs for one occupation, with the results the
 * programs reported to the U.S. Dept. of Labor (ETA-9171). Every figure is
 * shown as published; anything DOL hid or didn't receive says "Not reported".
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import Card from './Card';
import Icon from './Icon';
import Notice from './Notice';
import SectionLabel from './SectionLabel';
import { Colors, Fonts } from '../theme';
import { fetchTrainingOptions, TrainingOptions as Options, TrainingProgram, TRAINING_SOURCE } from '../lib/certPay';
import { t, tSource, isSpanish } from '../i18n';

const AJC_URL = 'https://www.careeronestop.org/LocalHelp/AmericanJobCenters/find-american-job-centers.aspx';
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (r: number | null) => (r == null ? null : `${Math.round(r * 100)}%`);
const NOT_REPORTED = () => t('Not reported');
const FORMAT: Record<string, string> = { in_person: 'In person', online: 'Online', hybrid: 'Hybrid', mixed: 'In person or online' };

function length(weeks: number | null) {
  if (!weeks) return null;
  if (weeks < 9) return Math.round(weeks) === 1 ? t('1 week') : t('{n} weeks', { n: Math.round(weeks) });
  return t('{n} months', { n: Math.round(weeks / 4.33) });
}

interface Props {
  soc: string;
  /** Occupation title for headings, e.g. "Electricians" */
  title?: string | null;
  state: string | null;
  stateName?: string | null;
  /** User's ZIP or metro point — nearest first, within SEARCH_RADIUS_MI */
  point?: { lat: number; lon: number } | null;
}

export default function TrainingOptions({ soc, title, state, stateName, point }: Props) {
  const [data, setData] = useState<Options | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetchTrainingOptions(soc, state, point).then((d) => {
      if (!alive) return;
      setData(d);
      setStatus(d ? 'ready' : 'error');
    });
    return () => { alive = false; };
  }, [soc, state, point?.lat, point?.lon]);

  if (status === 'loading') {
    return (
      <Card style={styles.loading}>
        <ActivityIndicator color={Colors.accent} size="small" />
        <Text style={styles.muted}>{t('Looking up approved training programs…')}</Text>
      </Card>
    );
  }
  if (status === 'error' || !data) {
    return <Notice tone="info">{t('Training program data isn\'t available right now — please try again later.')}</Notice>;
  }
  if (!data.programs.length) {
    return (
      <Notice tone="info">
        {stateName
          ? t('No government-approved training programs are listed for {job} in {state} yet.', { job: title ? t(title) : t('this job'), state: stateName })
          : t('No government-approved training programs are listed for {job} yet.', { job: title ? t(title) : t('this job') })}
      </Notice>
    );
  }

  const s = data.summary;
  const heading = data.scope === 'online' ? t('Approved training online')
    : data.scope === 'nearby' ? t('Approved training within {n} miles', { n: s.radius_mi ?? 50 })
    : stateName ? t('Approved training in {state}', { state: stateName }) : t('Approved training nationwide');
  const facts = [
    s.median_weeks ? t('typically {length} full-time', { length: length(s.median_weeks) }) : null,
    s.median_tuition ? t('typical tuition {amount}', { amount: money(s.median_tuition) }) : null,
    s.median_completion != null ? t('{pct} typically finish', { pct: pct(s.median_completion) }) : null,
  ].filter(Boolean).join(' · ');
  const forJob = title ? (isSpanish() ? t(title) : title.toLowerCase()) : null;

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionLabel icon="school-outline">{heading}</SectionLabel>
      <Text style={styles.summary}>
        {data.scope === 'online'
          ? (stateName
            ? t('No programs in {state} — here are online programs from other states.', { state: stateName })
            : t('No programs in your state — here are online programs from other states.'))
          : `${s.in_state === 1
              ? (forJob ? t('1 approved program for {job}', { job: forJob }) : t('1 approved program'))
              : (forJob ? t('{n} approved programs for {job}', { n: s.in_state, job: forJob }) : t('{n} approved programs', { n: s.in_state }))}${facts ? ` — ${facts}` : ''}.`}
      </Text>

      <Card variant="positive">
        <View style={styles.fundRow}>
          <Icon name="f:dollar-sign" size={16} color={Colors.positive} />
          <Text style={styles.fundText}>
            {t('These programs are approved for federal job-training funds (WIOA). Your local American Job Center may pay for it.')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(AJC_URL)} activeOpacity={0.7} style={styles.urlRow}>
          <Icon name="f:external-link" size={12} color={Colors.primaryOnDark} />
          <Text style={styles.link}>{t('Find your American Job Center')}</Text>
        </TouchableOpacity>
      </Card>

      {data.programs.map((p) => <ProgramCard key={p.id} p={p} />)}

      <Text style={styles.source}>
        {`${t('Source: {source}', { source: tSource(TRAINING_SOURCE) })}. ${t('Results are for everyone who left each program, as reported by the program.')}`}
      </Text>
    </View>
  );
}

function ProgramCard({ p }: { p: TrainingProgram }) {
  const cost = p.tuition != null ? p.tuition + (p.supplies ?? 0) : null;
  const rows: Array<[string, string]> = [
    [t('Length'), length(p.weeks) ?? NOT_REPORTED()],
    [t('Finish the program'), pct(p.completion_rate) ?? NOT_REPORTED()],
    [t('Working 6 months later'), pct(p.employed_q2_rate) ?? NOT_REPORTED()],
    [t('Earned the credential'), pct(p.credential_rate) ?? NOT_REPORTED()],
  ];
  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{p.name}</Text>
          <Text style={styles.provider}>{p.provider}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.cost}>{cost != null ? (cost === 0 ? t('Free') : money(cost)) : '—'}</Text>
          <Text style={styles.costLabel}>{t(cost != null ? (p.supplies ? 'tuition + supplies' : 'tuition') : 'cost not reported')}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        {(p.city || p.state) && (
          <View style={styles.metaItem}>
            <Icon name="f:map-pin" size={12} color={Colors.slate} />
            <Text style={styles.metaText}>{[p.city, p.state].filter(Boolean).join(', ') + (p.distance_mi != null ? ` · ${p.distance_mi} mi` : '')}</Text>
          </View>
        )}
        {p.format && (
          <View style={styles.metaItem}>
            <Icon name="f:monitor" size={12} color={Colors.slate} />
            <Text style={styles.metaText}>{FORMAT[p.format] ? t(FORMAT[p.format]) : p.format}</Text>
          </View>
        )}
      </View>
      {p.credential ? <Text style={styles.credential}>{t('You earn: {credential}', { credential: p.credential })}</Text> : null}
      <View style={styles.rows}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.rowKey}>{k}</Text>
            <Text style={[styles.rowVal, v === NOT_REPORTED() && styles.rowNone]}>{v}</Text>
          </View>
        ))}
      </View>
      {p.exited ? <Text style={styles.base}>{p.reported_at
        ? t('Based on {n} people who left the program (reported {year})', { n: Math.round(p.exited), year: p.reported_at.slice(0, 4) })
        : t('Based on {n} people who left the program', { n: Math.round(p.exited) })}</Text> : null}
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
  fundRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  fundText: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: Colors.text, lineHeight: 19 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 20 },
  provider: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17 },
  cost: { fontSize: 20, fontFamily: Fonts.displayBlack, color: Colors.positive },
  costLabel: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.faint },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.slate },
  credential: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSoft, marginTop: 8 },
  rows: { marginTop: 10, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowKey: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.muted },
  rowVal: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.text },
  rowNone: { fontFamily: Fonts.regular, color: Colors.faint },
  base: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 8 },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  link: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.primaryOnDark, textDecorationLine: 'underline' },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, lineHeight: 16, marginTop: 4 },
});
