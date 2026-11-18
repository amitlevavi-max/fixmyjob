/**
 * "Do you get health insurance through your job?" — asked only inside the
 * health insurance action and in Profile, never in onboarding (Amit,
 * 2026-11-06). If yes: what the user pays a month and who it covers, so we
 * can tell whether to ask for more (lib/healthInsurance). Answers save at once.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useUserStore, type HealthCoverage } from '../store/userStore';
import { useHealthInsurance, HEALTH_ID, type CoverageType } from '../lib/healthInsurance';
import Card from './Card';
import Chip from './Chip';
import Button from './Button';
import GhostButton from './GhostButton';
import TextField from './TextField';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';
import { money } from '../lib/format';

const COVERS: Array<{ id: CoverageType; label: string }> = [
  { id: 'single', label: 'Just me' },
  { id: 'plus_one', label: 'Me and one other person' },
  { id: 'family', label: 'My family' },
];

/** "Through my job · $120/month · just me" — for Profile */
export function coverageSummary(c: HealthCoverage | null): string | null {
  if (!c) return null;
  if (c.has === 'no') return t('Not through my job');
  if (c.has === 'unsure') return t('Not sure');
  const parts = [t('Through my job')];
  if (c.monthly != null) parts.push(t('{amount}/month', { amount: money(c.monthly) }));
  const covers = COVERS.find((x) => x.id === c.covers);
  if (covers) parts.push(t(covers.label).toLowerCase());
  return parts.join(' · ');
}

export default function HealthCoverageQuestion() {
  const { healthCoverage, setHealthCoverage, planDecisions, setPlanDecision, locationStateName } = useUserStore();
  const h = useHealthInsurance();
  const [editing, setEditing] = useState(!healthCoverage);
  const [saidYes, setSaidYes] = useState(healthCoverage?.has === 'yes');
  const [monthly, setMonthly] = useState(healthCoverage?.monthly != null ? String(healthCoverage.monthly) : '');
  const [covers, setCovers] = useState<CoverageType | null>(healthCoverage?.covers ?? null);

  // Covered as well as most → the action leaves the plan and the suggestions
  useEffect(() => {
    if (h.status === 'covered' && planDecisions[HEALTH_ID]) setPlanDecision(HEALTH_ID, null);
  }, [h.status]);

  const amount = Number(monthly.replace(/[^0-9.]/g, ''));
  const amountOk = monthly.trim() === '' || (Number.isFinite(amount) && amount >= 0 && amount <= 5000);

  function answer(has: HealthCoverage['has']) {
    if (has === 'yes') { setSaidYes(true); return; }
    setSaidYes(false);
    setHealthCoverage({ has, monthly: null, covers: null });
    setEditing(false);
  }
  function saveYes(withCost: boolean) {
    setHealthCoverage({ has: 'yes', monthly: withCost && monthly.trim() !== '' ? Math.round(amount) : null, covers: covers ?? 'single' });
    setEditing(false);
  }

  if (!editing && healthCoverage) {
    const place = h.premium?.state === 'US' || !locationStateName ? t('the US') : locationStateName;
    const result =
      h.status === 'covered'
        ? (healthCoverage.monthly != null
          ? t('You’re covered, and you pay no more than most workers in {place}. Nothing to ask for.', { place })
          : t('You’re covered. Nothing to ask for.'))
      : h.status === 'pays_more'
        ? t('You pay about {gap} a year more than the average worker in {place}. Ask your employer to pay a bigger share.', { gap: money(h.value), place })
      : h.status === 'none'
        ? (h.value > 0
          ? t('Asking for it could be worth about {amount} a year to you.', { amount: money(h.value) })
          : t('It’s worth asking about.'))
      : t('Look for a health insurance line on your pay stub, then answer again.');
    const tone = h.status === 'covered' ? Colors.positive : h.status === 'unknown' ? Colors.slate : Colors.accent;
    return (
      <Card style={{ marginBottom: 10 }}>
        <Text style={styles.kicker}>{t('YOUR HEALTH INSURANCE')}</Text>
        <Text style={styles.answer}>{coverageSummary(healthCoverage)}</Text>
        <View style={styles.resultRow}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <Text style={styles.result}>{result}</Text>
        </View>
        <GhostButton label={t('Change my answer')} onPress={() => { setSaidYes(healthCoverage.has === 'yes'); setEditing(true); }} />
      </Card>
    );
  }

  return (
    <Card variant="accent" style={{ marginBottom: 10 }}>
      <Text style={styles.kicker}>{t('YOUR HEALTH INSURANCE')}</Text>
      <Text style={styles.prompt}>{t('Do you get health insurance through your job?')}</Text>
      <View style={styles.chips}>
        <Chip label={t('Yes')} selected={saidYes} onPress={() => answer('yes')} />
        <Chip label={t('No')} selected={!saidYes && healthCoverage?.has === 'no'} onPress={() => answer('no')} />
        <Chip label={t('Not sure')} selected={!saidYes && healthCoverage?.has === 'unsure'} onPress={() => answer('unsure')} />
      </View>

      {saidYes && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.prompt}>{t('About how much do you pay for it each month?')}</Text>
          <Text style={styles.help}>{t('The amount taken from your pay for health insurance. Your pay stub shows it.')}</Text>
          <TextField
            value={monthly}
            onChangeText={setMonthly}
            placeholder={t('Dollars a month')}
            keyboardType="numeric"
            icon="f:dollar-sign"
          />
          {!amountOk && <Text style={styles.error}>{t('Enter an amount in dollars, like 150.')}</Text>}
          <Text style={[styles.prompt, { marginTop: 8 }]}>{t('Who does it cover?')}</Text>
          <View style={styles.chips}>
            {COVERS.map((c) => (
              <Chip key={c.id} label={t(c.label)} selected={covers === c.id} onPress={() => setCovers(c.id)} />
            ))}
          </View>
          <View style={styles.row}>
            <Button size="sm" label={t('Save')} disabled={!amountOk} onPress={() => saveYes(true)} />
            <Button size="sm" variant="secondary" label={t('Skip the cost')} onPress={() => saveYes(false)} />
          </View>
        </View>
      )}
      {healthCoverage && (
        <GhostButton label={t('Cancel')} onPress={() => { setSaidYes(healthCoverage.has === 'yes'); setEditing(false); }} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1, color: Colors.slate, marginBottom: 8 },
  prompt: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text, lineHeight: 22, marginBottom: 6 },
  help: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.muted, lineHeight: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  answer: { fontFamily: Fonts.semiBold, fontSize: 15, color: Colors.text, marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  result: { flex: 1, fontFamily: Fonts.bold, fontSize: 15, color: Colors.text, lineHeight: 21 },
  error: { fontFamily: Fonts.semiBold, fontSize: 12, color: Colors.accentHi, marginTop: -4, marginBottom: 6 },
});
