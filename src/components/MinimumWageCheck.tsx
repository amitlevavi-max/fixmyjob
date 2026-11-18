import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking } from 'react-native';
import { useUserStore } from '../store/userStore';
import { checkMinimumWage, defaultSchedule, WorkSchedule, FULL_TIME_HOURS } from '../lib/wageCheck';
import { WAGE_LAWS_CHECKED, STATE_WAGE_LAWS } from '../data/wageLaws';
import Card from './Card';
import Chip from './Chip';
import Icon from './Icon';
import IconTile from './IconTile';
import Stepper from './Stepper';
import SectionLabel from './SectionLabel';
import LocationPicker, { LocationResult } from './LocationPicker';
import { Colors, Fonts, Radii } from '../theme';
import { t, isSpanish } from '../i18n';

const money = (n: number) => `$${n.toFixed(2)}`;
const dollars = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString(isSpanish() ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Checks the user's pay against the minimum wage for their state, using an
 * editable work schedule (defaults: 40 h/week full time, 5 days, overtime at
 * the legal 1.5×, weekend premium only where the law requires one).
 */
export default function MinimumWageCheck() {
  const {
    profile, setProfile,
    locationState, locationIsMetro, locationMetro, locationLabel, setLocation,
    workSchedule, setWorkSchedule,
  } = useUserStore();

  const law = locationState ? STATE_WAGE_LAWS[locationState] : undefined;
  const defaults = defaultSchedule(locationState);
  const schedule: WorkSchedule = workSchedule ?? defaults;
  const update = (patch: Partial<WorkSchedule>) => setWorkSchedule({ ...schedule, ...patch });

  const [payMode, setPayMode] = useState<'hourly' | 'yearly'>(profile.hourlyRate ? 'hourly' : 'yearly');
  const [payText, setPayText] = useState(
    profile.hourlyRate ? String(profile.hourlyRate) : profile.annualEarnings ? String(profile.annualEarnings) : '',
  );
  const [showPicker, setShowPicker] = useState(false);
  const [showSchedule, setShowSchedule] = useState(true);

  function onPayChange(text: string) {
    setPayText(text);
    const n = Number(text.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return;
    if (payMode === 'hourly') setProfile({ hourlyRate: n });
    else setProfile({ annualEarnings: Math.round(n), hourlyRate: undefined });
  }
  function switchMode(mode: 'hourly' | 'yearly') {
    setPayMode(mode);
    if (mode === 'hourly') setPayText(profile.hourlyRate ? String(profile.hourlyRate) : '');
    else {
      setProfile({ hourlyRate: undefined });
      setPayText(profile.annualEarnings ? String(profile.annualEarnings) : '');
    }
  }

  const result = useMemo(
    () =>
      checkMinimumWage({
        annualEarnings: profile.annualEarnings ?? 0,
        hourlyRate: payMode === 'hourly' ? profile.hourlyRate : null,
        stateAbbr: locationState,
        isMetro: locationIsMetro,
        metro: locationMetro,
        schedule,
      }),
    [profile.annualEarnings, profile.hourlyRate, payMode, locationState, locationIsMetro, locationMetro, schedule],
  );

  const hasPay = result.baseHourly > 0;
  const min = result.minimum;
  const where = min.stateName
    ? `${min.stateName}${min.tierLabel ? ` · ${t(min.tierLabel)}` : ''}`
    : t('Federal (no state set)');
  const isDefault = (k: keyof WorkSchedule) => schedule[k] === defaults[k];
  const allDefault = (Object.keys(defaults) as Array<keyof WorkSchedule>).every(isDefault);

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionLabel icon="scale-balance">{t('Your minimum wage check')}</SectionLabel>

      {/* ── The law that applies ─────────────────────────────────────── */}
      <Card variant="feature" ticks>
        <View style={styles.lawRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{t('MINIMUM WAGE')} · {where.toUpperCase()}</Text>
            <Text style={styles.minRate}>
              {money(min.rate)}<Text style={styles.perHr}>{t('/hr')}</Text>
            </Text>
            {min.isFederal && min.stateName ? (
              <Text style={styles.small}>{t('Federal minimum applies — {state} has no higher rate', { state: min.stateName })}</Text>
            ) : min.note ? (
              <Text style={styles.small}>{t(min.note)}</Text>
            ) : null}
            {min.next && (
              <Text style={styles.small}>
                {t('Rises to')} <Text style={styles.strong}>{money(min.next.rate)}</Text> {t('on {date}', { date: fmtDate(min.next.effective) })}
              </Text>
            )}
          </View>
          <TouchableOpacity style={styles.stateBtn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
            <Icon name="f:map-pin" size={14} color={Colors.accentHi} />
            <Text style={styles.stateBtnText}>{t(locationLabel ? 'Change' : 'Set state')}</Text>
          </TouchableOpacity>
        </View>
        {!locationState && (
          <Text style={[styles.small, { color: Colors.accentHi, marginTop: 8 }]}>
            {t('Most states pay more than the federal $7.25 — set your state for an accurate check.')}
          </Text>
        )}
      </Card>

      {/* ── What you're paid ─────────────────────────────────────────── */}
      <Card>
        <Text style={styles.fieldLabel}>{t('WHAT YOU\'RE PAID (BEFORE TAX)')}</Text>
        <View style={styles.modeRow}>
          <Chip label={t('Per hour')} selected={payMode === 'hourly'} onPress={() => switchMode('hourly')} />
          <Chip label={t('Per year')} selected={payMode === 'yearly'} onPress={() => switchMode('yearly')} />
        </View>
        <View style={styles.payField}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            style={styles.payInput}
            value={payText}
            onChangeText={onPayChange}
            keyboardType="decimal-pad"
            placeholder={payMode === 'hourly' ? '15.00' : '30000'}
            placeholderTextColor={Colors.faint}
          />
          <Text style={styles.payUnit}>{t(payMode === 'hourly' ? 'per hour' : 'per year')}</Text>
        </View>
        <Text style={styles.small}>
          {payMode === 'hourly'
            ? t('Your base rate — before overtime or weekend extras.')
            : t('Include tips if you get them. We work out your hourly rate from your schedule below.')}
        </Text>
      </Card>

      {/* ── Verdict ──────────────────────────────────────────────────── */}
      {hasPay && (() => {
        const problem = result.annualShortfall > 0;
        const title = result.belowMinimum && result.overtimeUnderpaid
          ? 'Below minimum wage & overtime'
          : result.belowMinimum
          ? 'Below the minimum wage'
          : result.overtimeUnderpaid
          ? 'Overtime not paid as required'
          : 'Paid what the law requires';
        return (
          <Card variant={problem ? 'accent' : 'positive'}>
            <View style={styles.verdictHead}>
              <IconTile icon={problem ? 'f:alert-triangle' : 'f:check'} tone={problem ? 'solid' : 'positive'} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.verdictTitle}>{t(title)}</Text>
                <Text style={styles.small}>
                  {t(payMode === 'hourly' ? 'Your base rate' : 'Works out to')}{' '}
                  <Text style={styles.strong}>{t('{amount}/hr', { amount: money(result.baseHourly) })}</Text> {t('vs {min} minimum', { min: money(min.rate) })}
                </Text>
              </View>
            </View>
            {problem ? (
              <View style={styles.owed}>
                <Text style={styles.owedLabel}>{t('POSSIBLY OWED')}</Text>
                <Text style={styles.owedValue}>
                  ~{dollars(result.annualShortfall)}<Text style={styles.perHr}>{t('/yr')}</Text>
                </Text>
                {result.minimumShortfall > 0 && (
                  <Text style={styles.small}>
                    • {t('Minimum wage: ~{amount}/yr ({hourly}/hr short)', { amount: dollars(result.minimumShortfall), hourly: money(-result.marginPerHour) })}
                  </Text>
                )}
                {result.overtimeShortfall > 0 && (
                  <Text style={styles.small}>
                    • {t(law?.sundayPremium ? 'Overtime & Sunday premium: ~{amount}/yr' : 'Overtime: ~{amount}/yr', { amount: dollars(result.overtimeShortfall) })}
                    {schedule.overtimeMultiplier === 0 && result.overtimeHours > 0
                      ? ` ${t('({hours}/week unpaid)', { hours: fmtH(result.overtimeHours + result.doubleTimeHours) })}`
                      : ''}
                  </Text>
                )}
                <Text style={[styles.small, { marginTop: 6 }]}>
                  {t('You can usually claim up to 2 years back (3 if willful).')}
                </Text>
              </View>
            ) : (
              <Text style={[styles.small, { marginTop: 8 }]}>
                {t('{amount}/hr above the minimum on this schedule.', { amount: money(result.marginPerHour) })}
                {payMode === 'yearly' ? ` ${t('If you work more hours than below, update them — it changes the result.')}` : ''}
              </Text>
            )}
          </Card>
        );
      })()}

      {/* ── Schedule (editable defaults) ─────────────────────────────── */}
      <Card>
        <TouchableOpacity style={styles.schedHead} onPress={() => setShowSchedule((v) => !v)} activeOpacity={0.8}>
          <Text style={styles.fieldLabel}>{t('YOUR WORK WEEK')}</Text>
          <Icon name={showSchedule ? 'f:chevron-up' : 'f:chevron-down'} size={18} color={Colors.slate} />
        </TouchableOpacity>
        <Text style={styles.breakdown}>
          {t('{hours} regular', { hours: fmtH(result.regularHours) })}
          {result.overtimeHours > 0
            ? ` + ${schedule.overtimeMultiplier === 0
              ? t('{hours} overtime (unpaid)', { hours: fmtH(result.overtimeHours) })
              : t('{hours} overtime at {x}×', { hours: fmtH(result.overtimeHours), x: schedule.overtimeMultiplier })}`
            : ''}
          {result.doubleTimeHours > 0 ? ` + ${t('{hours} double time', { hours: fmtH(result.doubleTimeHours) })}` : ''}
          {schedule.weekendHoursPerWeek > 0 && schedule.weekendPremiumPct > 0
            ? ` · ${t('{n} weekend h at +{pct}%', { n: schedule.weekendHoursPerWeek, pct: schedule.weekendPremiumPct })}`
            : ''}
        </Text>

        {showSchedule && (
          <>
            <Stepper
              label={t('Hours per week')}
              hint={t('Default {n} (full time). Over 40 = overtime.', { n: FULL_TIME_HOURS })}
              value={schedule.hoursPerWeek}
              min={1}
              max={84}
              onChange={(v) => update({ hoursPerWeek: v, weekendHoursPerWeek: Math.min(schedule.weekendHoursPerWeek, v) })}
              isDefault={isDefault('hoursPerWeek')}
            />
            <Stepper
              label={t('Days per week')}
              hint={t('Used for daily-overtime rules')}
              value={schedule.daysPerWeek}
              min={1}
              max={7}
              onChange={(v) => update({ daysPerWeek: v })}
              isDefault={isDefault('daysPerWeek')}
            />
            <Stepper
              label={t('Weekend hours')}
              hint={t('Of your weekly hours, how many are Sat/Sun')}
              value={schedule.weekendHoursPerWeek}
              min={0}
              max={Math.min(48, schedule.hoursPerWeek)}
              onChange={(v) => update({ weekendHoursPerWeek: v })}
              isDefault={isDefault('weekendHoursPerWeek')}
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>{t('OVERTIME PAY')}</Text>
            <View style={styles.modeRow}>
              {OVERTIME_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={t(o.label)}
                  selected={schedule.overtimeMultiplier === o.value}
                  onPress={() => update({ overtimeMultiplier: o.value })}
                />
              ))}
            </View>
            <Text style={styles.small}>
              {schedule.overtimeMultiplier < 1.5
                ? t("Hourly workers must get at least 1.5× for overtime — we'll count the difference as money owed.")
                : t('Hours over 40 a week must be paid at least 1.5× (legal minimum).')}
            </Text>

            <Text style={[styles.fieldLabel, { marginTop: 6 }]}>{t('WEEKEND PREMIUM')}</Text>
            <View style={styles.modeRow}>
              {[0, 10, 25, 50].map((p) => (
                <Chip
                  key={p}
                  label={p === 0 ? t('None') : `+${p}%`}
                  selected={schedule.weekendPremiumPct === p}
                  onPress={() => update({ weekendPremiumPct: p })}
                />
              ))}
            </View>
            <Text style={styles.small}>
              {defaults.weekendPremiumPct > 0
                ? t('Default +{pct}% — required by law for Sunday work in your state.', { pct: defaults.weekendPremiumPct })
                : t('No weekend premium is required by law in your state. Pick one only if your employer pays it.')}
            </Text>

            {!allDefault && (
              <TouchableOpacity onPress={() => setWorkSchedule(null)} style={styles.reset} activeOpacity={0.7}>
                <Icon name="f:rotate-ccw" size={14} color={Colors.accentHi} />
                <Text style={styles.resetText}>{t('Reset to defaults')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </Card>

      {/* ── Rules used ───────────────────────────────────────────────── */}
      <View style={styles.notes}>
        {result.notes.map((n) => (
          <View key={n} style={styles.noteRow}>
            <Icon name="f:info" size={13} color={Colors.slate} style={{ marginTop: 2 }} />
            <Text style={styles.noteText}>{t(n)}</Text>
          </View>
        ))}
        {law?.localMinimums?.length ? (
          <View style={styles.noteRow}>
            <Icon name="f:map" size={13} color={Colors.accentHi} style={{ marginTop: 2 }} />
            <Text style={styles.noteText}>
              {t('Some places in {state} set a higher minimum than the state:', { state: law.name })}{' '}
              <Text style={styles.strong}>{law.localMinimums.slice(0, 6).join(', ')}</Text>
              {law.localMinimums.length > 6 ? ` ${t('and more')}` : ''}. {t('If you work there, the local rate applies.')}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => Linking.openURL('https://www.dol.gov/agencies/whd/minimum-wage/state')}
          activeOpacity={0.7}
        >
          <Text style={styles.source}>
            {t('Source: US Dept. of Labor state minimum wage table · checked {date}', { date: fmtDate(WAGE_LAWS_CHECKED) })} ↗
          </Text>
        </TouchableOpacity>
      </View>

      <LocationPicker
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(r: LocationResult) => {
          setLocation(r);
          setShowPicker(false);
        }}
      />
    </View>
  );
}

const fmtH = (h: number) => `${Math.round(h * 10) / 10} h`;

// What the employer actually pays for overtime — includes illegal options on purpose
const OVERTIME_OPTIONS = [
  { value: 0, label: 'Not paid' },
  { value: 1, label: 'Same rate' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5× (legal min.)' },
  { value: 2, label: '2× or more' },
];

const styles = StyleSheet.create({
  lawRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 4 },
  kicker: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.3, color: Colors.accentHi },
  minRate: { fontSize: 46, lineHeight: 50, fontFamily: Fonts.displayBlack, color: Colors.text, marginTop: 2 },
  perHr: { fontSize: 18, fontFamily: Fonts.displayBold, color: Colors.slate },
  small: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 18, marginTop: 2 },
  strong: { fontFamily: Fonts.bold, color: Colors.text },
  stateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accentLine,
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  stateBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentHi },

  fieldLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.3, color: Colors.slate, marginBottom: 8 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  payField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    borderRadius: Radii.lg,
    backgroundColor: Colors.field,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 6,
  },
  dollar: { fontSize: 22, fontFamily: Fonts.displayBold, color: Colors.slate },
  payInput: { flex: 1, fontSize: 24, fontFamily: Fonts.displayBold, color: Colors.text, paddingVertical: 10 },
  payUnit: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.muted },

  verdictHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  verdictTitle: { fontSize: 20, lineHeight: 22, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  owed: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line },
  owedLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.3, color: Colors.slate },
  owedValue: { fontSize: 38, lineHeight: 42, fontFamily: Fonts.displayBlack, color: Colors.accent },

  schedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  breakdown: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textSoft, marginBottom: 4 },
  reset: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  resetText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentHi },

  notes: { gap: 8, marginBottom: 12, paddingHorizontal: 4 },
  noteRow: { flexDirection: 'row', gap: 8 },
  noteText: { flex: 1, fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17 },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, textDecorationLine: 'underline' },
});
