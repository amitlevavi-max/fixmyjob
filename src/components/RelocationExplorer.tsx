import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useUserStore } from '../store/userStore';
import {
  useWageMap, homeOf, recommendPlaces, realValue, jobSearchUrl, Place, Recommendation, WageMap, Home,
} from '../lib/relocation';
import Card from './Card';
import Chip from './Chip';
import Icon from './Icon';
import Notice from './Notice';
import SectionLabel from './SectionLabel';
import TextField from './TextField';
import Button from './Button';
import OccupationPicker from './OccupationPicker';
import { knownOccupation } from '../lib/occupationSearch';
import { CATEGORY_OCCUPATIONS } from '../data/blsOews';
import { Colors, Fonts, Radii } from '../theme';
import { t, tSource, isSpanish } from '../i18n';
import { SRC } from '../data/sourceLabels';

const homeName = (home: { label: string }) => (home.label === 'the US' ? t('the US') : home.label);

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const placeLabel = (p: Place) => (p.type === 'metro' && !p.rural ? `${p.short}, ${p.states.join('-')}` : p.short);

/** Shared data for the explorer and the job-search step on the same screen */
function useRelocationData(fill: boolean) {
  const { matchedOccupation, profile, locationState, locationMetro, locationIsMetro } = useUserStore();
  const map = useWageMap(matchedOccupation?.soc, { fill });
  const home = useMemo(() => homeOf(map, locationState, locationMetro, locationIsMetro), [map, locationState, locationMetro, locationIsMetro]);
  return { map, home, pay: profile.annualEarnings ?? 0, state: locationState, occ: matchedOccupation, query: profile.role || matchedOccupation?.title || '' };
}

/**
 * Relocation opportunity: 3–5 places where the same job pays more after cost
 * of living, plus a browsable list of every state and metro.
 */
export default function RelocationExplorer() {
  const { map, home, pay, state, occ, query } = useRelocationData(true);
  const [scope, setScope] = useState<'anywhere' | 'state'>('anywhere');

  if (!occ) return <ChooseOccupation />;
  if (map.loading) return <Loading text={t('Loading wages…')} />;
  if (map.error && !map.states.length && !map.metros.length) return <Notice tone="danger">{t(map.error)}</Notice>;

  const recs = recommendPlaces(map, home, pay, { onlyState: scope === 'state' ? state : null });
  const usingStates = map.metros.length < 20;

  return (
    <View style={{ marginBottom: 10 }}>
      <SectionLabel icon="map-marker-radius-outline">{t('Where your job pays more')}</SectionLabel>

      {home.median ? (
        <Text style={styles.intro}>
          {t('Typical pay for {job} in {place}:', { job: isSpanish() ? t(occ.title) : occ.title.toLowerCase(), place: homeName(home) })} <Text style={styles.strong}>{t('{amount}/yr', { amount: money(home.median) })}</Text>.
          {' '}{t('Places below pay more')} <Text style={styles.strong}>{t('after living costs')}</Text>.
        </Text>
      ) : null}

      {pay > 0 && home.median && pay < home.median * 0.9 ? (
        <Notice tone="accent" icon="f:info">
          {t('Your pay ({pay}) is {pct}% below typical pay for this job in {place} ({median}). Part of the gains below you could also get without moving — by asking for a raise or switching employers locally.', { pay: money(pay), pct: Math.round((1 - pay / home.median) * 100), place: homeName(home), median: money(home.median) })}
        </Notice>
      ) : null}

      {map.filling && <Loading text={t('Loading wages for about 390 cities — first time only, up to a minute…')} />}

      {!usingStates && state ? (
        <View style={styles.chips}>
          <Chip label={t('Anywhere in the US')} selected={scope === 'anywhere'} onPress={() => setScope('anywhere')} />
          <Chip label={t('In {state}', { state })} selected={scope === 'state'} onPress={() => setScope('state')} />
        </View>
      ) : null}

      {recs.length > 0 ? (
        recs.map((r, i) => <RecommendationCard key={r.place.code} rec={r} rank={i + 1} home={home} pay={pay} query={query} />)
      ) : !map.filling ? (
        <Notice tone="info" icon="f:check-circle">
          {scope === 'state'
            ? t('No city in {state} pays clearly more for this job after living costs.', { state })
            : t('{place} already pays well for this job — no place pays 5%+ more after living costs.', { place: home.label === 'the US' ? t('The US as a whole') : home.label })}
        </Notice>
      ) : null}

      {usingStates && !map.filling && (
        <Text style={styles.note}>{t('Comparing states for now — city-level wages are still loading for this job.')}</Text>
      )}

      <Explorer map={map} home={home} pay={pay} />

      <Text style={styles.source}>
        {t('Median yearly pay:')} {tSource(`${SRC.BLS}${map.national?.period ? `, ${map.national.period}` : ''}`)}.
        {' '}{t('Living costs:')} {tSource(`${SRC.BEA}${firstRppYear(map) ? `, ${firstRppYear(map)}` : ''}`)} {t('(US average = 100).')}
        {' '}{t('* % and $ compare typical pay there, adjusted to {prices} prices, with your own pay.', { prices: home.label === 'the US' ? t('US-average') : home.label })}
      </Text>
    </View>
  );
}

/** No BLS occupation saved yet — let the user pick it right here. */
function ChooseOccupation() {
  const { profile, setMatchedOccupation } = useUserStore();
  const role = (profile.role ?? '').trim();
  // A "line of work" chip (e.g. "Hospitality") is a category, not a job title
  const category = Object.keys(CATEGORY_OCCUPATIONS).find((c) => c.toLowerCase() === role.toLowerCase());
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const chosen = knownOccupation(selected);

  return (
    <Card variant="accent">
      <Text style={styles.chooseTitle}>{t('Which job do you do?')}</Text>
      <Text style={styles.intro}>
        {t('We compare pay for one specific job across cities.')} {role ? t('Pick the closest match to "{role}".', { role }) : t('Pick the closest match.')}
      </Text>
      <OccupationPicker
        query={category ? '' : role}
        category={category}
        selected={selected}
        onSelect={setSelected}
        text={text}
        onTextChange={setText}
        allowNone={false}
      />
      <Button
        label={chosen ? t('Compare pay for {job} →', { job: t(chosen.title) }) : t('Pick a job above')}
        disabled={!chosen}
        onPress={() => chosen && setMatchedOccupation(chosen)}
        style={{ marginTop: 12 }}
      />
    </Card>
  );
}

function firstRppYear(map: WageMap) {
  return [...map.metros, ...map.states].find((p) => p.rppYear)?.rppYear ?? null;
}

function Loading({ text }: { text: string }) {
  return (
    <Card style={styles.loading}>
      <ActivityIndicator color={Colors.accent} size="small" />
      <Text style={styles.loadingText}>{text}</Text>
    </Card>
  );
}

function RecommendationCard({ rec, rank, home, pay, query }: { rec: Recommendation; rank: number; home: Home; pay: number; query: string }) {
  // Phrases for comparing with where the user lives (or the US when no location is set)
  const national = home.label === 'the US';
  const homeNoun = national ? t('the US average') : t('in {place}', { place: home.label });
  const homePrices = national ? t('at US-average prices') : t('at {place} prices', { place: home.label });
  const homeMedian = national ? t('the US median') : t('the median in {place}', { place: home.label });
  const p = rec.place;
  return (
    <Card variant={rank === 1 ? 'accent' : 'default'}>
      <View style={styles.recHead}>
        <View style={[styles.rank, rank === 1 && styles.rankTop]}>
          <Text style={[styles.rankText, rank === 1 && { color: '#fff' }]}>{rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.recName}>{placeLabel(p)}</Text>
          <Text style={styles.recSub}>
            {t('Median {amount}/yr', { amount: money(p.p50) })}{p.jobs ? ` · ${t('{n} jobs', { n: Math.round(p.jobs).toLocaleString() })}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.recPct}>+{rec.vsYouPct ?? rec.realPct}%</Text>
          <Text style={styles.recPctLabel}>{t(rec.vsYouPct !== null ? 'vs your pay*' : 'after living costs')}</Text>
        </View>
      </View>

      <View style={styles.recFacts}>
        {rec.costPct !== null && (
          <Text style={styles.fact}>
            <Icon name="f:home" size={12} color={Colors.slate} />{' '}
            {rec.costPct === 0
              ? t('Living costs are about the same as {home}', { home: homeNoun })
              : rec.costPct > 0
              ? t('Living costs are {pct}% higher than {home}', { pct: Math.abs(rec.costPct), home: homeNoun })
              : t('Living costs are {pct}% lower than {home}', { pct: Math.abs(rec.costPct), home: homeNoun })}
          </Text>
        )}
        {pay > 0 && rec.gainForYou > 0 && (
          <Text style={styles.fact}>
            <Icon name="f:trending-up" size={12} color={Colors.positive} />{' '}
            {t('Adjusted for living costs, the median here is like earning {amount}/yr {prices} —', { amount: money(rec.real), prices: homePrices })} <Text style={styles.gain}>{t('{amount}/yr more', { amount: money(rec.gainForYou) })}</Text> {t('than you earn')}
          </Text>
        )}
        <Text style={styles.fact}>
          <Icon name="f:map-pin" size={12} color={Colors.slate} />{' '}
          {rec.costPct != null && rec.costPct < 0
            ? t('With the lower living costs counted, this job pays {pct}% more here than {median}', { pct: rec.realPct, median: homeMedian })
            : rec.costPct != null && rec.costPct > 0
            ? t('Even after the higher living costs, this job pays {pct}% more here than {median}', { pct: rec.realPct, median: homeMedian })
            : t('After living costs, this job pays {pct}% more here than {median}', { pct: rec.realPct, median: homeMedian })}
        </Text>
      </View>

      <TouchableOpacity style={styles.jobsLink} onPress={() => Linking.openURL(jobSearchUrl(query, p))} activeOpacity={0.7}>
        <Icon name="f:search" size={14} color={Colors.accentHi} />
        <Text style={styles.jobsLinkText}>{query ? t('Find "{job}" jobs in {place}', { job: query, place: p.short }) : t('Find jobs in {place}', { place: p.short })}</Text>
        <Icon name="f:external-link" size={13} color={Colors.slate} />
      </TouchableOpacity>
    </Card>
  );
}

const PAGE = 15;

/** Every state / metro, sortable, searchable */
function Explorer({ map, home, pay }: { map: WageMap; home: Home; pay: number }) {
  const [tab, setTab] = useState<'metro' | 'state'>(map.metros.length >= 20 ? 'metro' : 'state');
  const [sort, setSort] = useState<'real' | 'pay'>('real');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const hasRpp = [...map.metros, ...map.states].some((p) => p.rpp);

  const list = useMemo(() => {
    const base = tab === 'metro' ? map.metros : map.states;
    const needle = q.trim().toLowerCase();
    return base
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.states.some((s) => s.toLowerCase() === needle))
      .map((p) => ({ p, real: realValue(p, home) }))
      .sort((a, b) => (sort === 'real' && hasRpp ? b.real - a.real : b.p.p50 - a.p.p50));
  }, [map, tab, sort, q, home, hasRpp]);

  if (!map.states.length && !map.metros.length) return null;
  // Compare with the user's own pay; fall back to typical local pay
  const base = pay > 0 ? pay : home.median ?? map.national?.p50 ?? null;
  const baseLabel = pay > 0 ? t('your pay ({amount})', { amount: money(pay) }) : t('typical pay in {place}', { place: homeName(home) });

  return (
    <View style={{ marginTop: 14 }}>
      <SectionLabel icon="f:map">{t('Explore pay by place')}</SectionLabel>
      <View style={styles.chips}>
        <Chip label={t('Cities ({n})', { n: map.metros.length })} selected={tab === 'metro'} onPress={() => { setTab('metro'); setShown(PAGE); }} disabled={!map.metros.length} />
        <Chip label={t('States ({n})', { n: map.states.length })} selected={tab === 'state'} onPress={() => { setTab('state'); setShown(PAGE); }} />
      </View>
      {hasRpp && (
        <View style={styles.chips}>
          <Chip label={t('After living costs')} selected={sort === 'real'} onPress={() => setSort('real')} />
          <Chip label={t('Highest pay')} selected={sort === 'pay'} onPress={() => setSort('pay')} />
        </View>
      )}
      <TextField
        icon="f:search"
        placeholder={t(tab === 'metro' ? 'Search a city or state (e.g. Denver, TX)' : 'Search a state')}
        value={q}
        onChangeText={(v) => { setQ(v); setShown(PAGE); }}
        autoCorrect={false}
        containerStyle={{ marginBottom: 8 }}
      />

      <Card padded={false}>
        {list.slice(0, shown).map(({ p, real }, i) => {
          const isHome = home.place?.code === p.code && home.place?.type === p.type;
          const diff = base ? Math.round(((sort === 'real' && hasRpp ? real : p.p50) / base - 1) * 100) : null;
          return (
            <View key={p.type + p.code} style={[styles.row, isHome && styles.rowHome, i === Math.min(shown, list.length) - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.rowRank}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {placeLabel(p)}{isHome ? '  ' : ''}{isHome ? <Text style={styles.youTag}>{t('YOU')}</Text> : null}
                </Text>
                <Text style={styles.rowSub}>
                  {t('{amount}/yr', { amount: money(p.p50) })}{p.rpp ? ` · ${t('prices {n}', { n: Math.round(p.rpp) })}` : ''}{p.jobs ? ` · ${t('{n} jobs', { n: Math.round(p.jobs).toLocaleString() })}` : ''}
                </Text>
              </View>
              {diff !== null && (pay > 0 || !isHome) && (
                <Text style={[styles.rowDiff, { color: diff > 0 ? Colors.positive : diff < 0 ? Colors.muted : Colors.slate }]}>
                  {diff > 0 ? '+' : ''}{diff}%
                </Text>
              )}
            </View>
          );
        })}
        {!list.length && <Text style={[styles.rowSub, { padding: 16 }]}>{t('No match.')}</Text>}
      </Card>
      {list.length > shown && (
        <TouchableOpacity onPress={() => setShown(list.length)} style={styles.more} activeOpacity={0.7}>
          <Text style={styles.moreText}>{t('Show all {n}', { n: list.length })}</Text>
        </TouchableOpacity>
      )}
      {base ? (
        <Text style={styles.note}>
          {sort === 'real' && hasRpp
            ? t('% = typical pay there, adjusted to {prices} prices, compared with {base}.', { prices: home.label === 'the US' ? t('US-average') : home.label, base: baseLabel })
            : t('% = typical pay there compared with {base}.', { base: baseLabel })} {t('"Prices" = living costs (US average 100).')}
        </Text>
      ) : null}
    </View>
  );
}

/** Job-search links for the top cities (used by the "Search for jobs there" step) */
export function RelocationJobLinks() {
  const { map, home, pay, query } = useRelocationData(false);
  const recs = recommendPlaces(map, home, pay, { limit: 3 });
  if (!recs.length) return null;
  return (
    <View style={{ marginTop: -4, marginBottom: 8, gap: 2 }}>
      {recs.map((r) => (
        <TouchableOpacity key={r.place.code} style={styles.jobsLink} onPress={() => Linking.openURL(jobSearchUrl(query, r.place))} activeOpacity={0.7}>
          <Icon name="f:search" size={14} color={Colors.accentHi} />
          <Text style={styles.jobsLinkText}>{t('Jobs in {place}', { place: placeLabel(r.place) })}</Text>
          <Icon name="f:external-link" size={13} color={Colors.slate} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chooseTitle: { fontSize: 20, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text, marginBottom: 6 },
  intro: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20, marginBottom: 12 },
  strong: { fontFamily: Fonts.bold, color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingText: { flex: 1, fontSize: 14, fontFamily: Fonts.medium, color: Colors.textSoft },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: Colors.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  rankTop: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  rankText: { fontFamily: Fonts.displayBold, fontSize: 15, color: Colors.accentHi },
  recName: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.text },
  recSub: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.slate, marginTop: 2 },
  recPct: { fontSize: 24, lineHeight: 26, fontFamily: Fonts.displayBlack, color: Colors.positive },
  recPctLabel: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 0.8, color: Colors.slate, textTransform: 'uppercase' },
  recFacts: { marginTop: 10, gap: 4 },
  fact: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 18 },
  gain: { fontFamily: Fonts.bold, color: Colors.positive },
  jobsLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginTop: 6 },
  jobsLinkText: { flex: 1, fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentHi },
  note: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17, marginTop: 6 },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 16, marginTop: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  rowHome: { backgroundColor: Colors.accentSoft },
  rowRank: { width: 24, fontFamily: Fonts.displayBold, fontSize: 14, color: Colors.slate },
  rowName: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  rowSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.slate, marginTop: 2 },
  rowDiff: { fontSize: 16, fontFamily: Fonts.displayBold, minWidth: 44, textAlign: 'right' },
  youTag: { fontSize: 10, fontFamily: Fonts.bold, color: Colors.accentHi, letterSpacing: 1 },
  more: { alignItems: 'center', paddingVertical: 12 },
  moreText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentHi },
});
