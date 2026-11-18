/**
 * Everything about one short course on its plan item (2026-10-26, Amit):
 * what it is, cost, length, results of past students (DOL training provider
 * results) and how to reach the provider — website, course page, phone and
 * email, looked up live on the provider's own site (Edge Function
 * course-contact, cached 90 days). Every figure names its source.
 *
 * Courses from the Credential Engine registry (2026-11-12) use the same card:
 * cost and length as the provider published them, no past-student results
 * (Credential Engine doesn't publish any), the credentials the course prepares
 * for, and a link to the course's Credential Finder page.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import Card from './Card';
import Icon from './Icon';
import SectionLabel from './SectionLabel';
import { Colors, Fonts } from '../theme';
import { t, tSource } from '../i18n';
import { supabase } from '../lib/supabase';
import { TRAINING_SOURCE } from '../lib/certPay';
import { SRC, estimate } from '../data/sourceLabels';
import type { ShortCourse } from '../lib/shortCourses';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (r: number | null | undefined) => (r == null ? null : `${Math.round(r * 100)}%`);
const NOT_REPORTED = () => t('Not reported');
const FORMAT: Record<string, string> = { in_person: 'In person', online: 'Online', hybrid: 'Hybrid', mixed: 'In person or online' };
const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

interface Contact {
  website: string | null; program_url: string | null; phone: string | null; email: string | null;
  sources: Partial<Record<'website' | 'program_url' | 'phone' | 'email', string>>;
}

const contactCache = new Map<string, Promise<{ contact: Contact; foundAt: string } | null>>();
function fetchContact(programId: string) {
  if (!contactCache.has(programId)) {
    const p = Promise.resolve(supabase.functions.invoke('course-contact', { body: { programId } }))
      .then(({ data, error }) => (error || !data?.contact ? null : data), () => null)
      .then((r) => { if (!r) contactCache.delete(programId); return r; });
    contactCache.set(programId, p);
  }
  return contactCache.get(programId)!;
}

export default function CourseDetails({ course }: { course: ShortCourse }) {
  return course.web ? <WebCourseDetails course={course} /> : <DolCourseDetails course={course} />;
}

function DolCourseDetails({ course: c }: { course: ShortCourse }) {
  const [contact, setContact] = useState<{ contact: Contact; foundAt: string } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'none'>('loading');
  const [more, setMore] = useState(false);
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetchContact(c.id).then((r) => { if (!alive) return; setContact(r); setStatus(r ? 'ready' : 'none'); });
    return () => { alive = false; };
  }, [c.id]);

  const ce = c.source === 'credential_engine';
  const cost = c.tuition != null ? c.tuition + (c.supplies ?? 0) : null;
  const hours = Math.round(c.total_hours);
  const weeks = Math.max(1, Math.round(c.weeks ?? 1));
  const finished = c.exited != null && c.completion_rate != null ? Math.round(c.exited * c.completion_rate) : null;
  const yearlyPay = c.median_q2_earnings != null && c.median_q2_earnings > 0 ? c.median_q2_earnings * 4 : null;
  const results: Array<[string, string]> = [
    [t('People who finished'), finished != null ? String(finished) : NOT_REPORTED()],
    [t('Finish the course'), pct(c.completion_rate) ?? NOT_REPORTED()],
    [t('Working 6 months later'), pct(c.employed_q2_rate) ?? NOT_REPORTED()],
    [t('Typical pay after the course'), yearlyPay != null ? t('{amount}/yr', { amount: money(yearlyPay) }) : NOT_REPORTED()],
    [t('Earned the credential'), pct(c.credential_rate) ?? NOT_REPORTED()],
  ];
  const anyResult = results.some(([, v]) => v !== NOT_REPORTED());
  const description = c.description ?? '';
  const longText = description.length > 260;

  const k = contact?.contact;
  const rows: Array<{ icon: string; label: string; value: string; open: string; source?: string }> = [];
  if (k?.program_url) rows.push({ icon: 'f:external-link', label: t('Course page'), value: host(k.program_url), open: k.program_url, source: k.sources.program_url });
  if (k?.website && (!k.program_url || host(k.website) !== host(k.program_url) || k.website !== k.program_url)) {
    rows.push({ icon: 'f:globe', label: t('Website'), value: host(k.website), open: k.website, source: k.sources.website });
  }
  if (k?.phone) rows.push({ icon: 'f:phone', label: t('Call'), value: k.phone, open: `tel:${k.phone.replace(/\D/g, '')}`, source: k.sources.phone });
  if (k?.email) rows.push({ icon: 'f:mail', label: t('Email'), value: k.email, open: `mailto:${k.email}`, source: k.sources.email });
  if (!rows.length && c.url) rows.push({ icon: 'f:external-link', label: t('Course page'), value: host(c.url), open: c.url, source: ce ? SRC.CE : SRC.DOL });
  const updated = c.ce_updated_at ? new Date(`${c.ce_updated_at}T12:00:00`).toLocaleDateString() : null;

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionLabel icon="f:book-open">{t('About this course')}</SectionLabel>
      <Card>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.provider}>{c.provider}</Text>
            {c.address ? <Text style={styles.small}>{c.address}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.cost}>{cost != null ? (cost === 0 ? t('Free') : money(cost)) : '—'}</Text>
            <Text style={styles.costLabel}>{t(cost != null ? (ce ? 'listed cost' : c.supplies ? 'tuition + supplies' : 'tuition') : 'cost not reported')}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Icon name="f:monitor" size={12} color={Colors.slate} />
            <Text style={styles.metaText}>{c.format && FORMAT[c.format] ? t(FORMAT[c.format]) : c.format ?? ''}</Text>
          </View>
          <View style={styles.metaItem}>
            <Icon name="f:clock" size={12} color={Colors.slate} />
            <Text style={styles.metaText}>{weeks > 1 ? t('About {hours} hours over {weeks} weeks', { hours, weeks }) : t('About {hours} hours', { hours })}</Text>
          </View>
          {c.distance_mi != null && c.format !== 'online' ? (
            <View style={styles.metaItem}>
              <Icon name="f:map-pin" size={12} color={Colors.slate} />
              <Text style={styles.metaText}>{t('{miles} miles from you', { miles: Math.max(1, Math.round(c.distance_mi)) })}</Text>
            </View>
          ) : null}
        </View>
        {c.credential ? <Text style={styles.credential}>{t('You earn: {credential}', { credential: c.credential })}</Text> : null}
        {c.leads_to?.length ? (
          <View style={styles.leads}>
            <Text style={styles.credential}>{t('Prepares you for:')}</Text>
            {c.leads_to.map((x) => (
              <TouchableOpacity key={x.name} disabled={!x.finder_url} onPress={() => x.finder_url && Linking.openURL(x.finder_url)} activeOpacity={0.7}>
                <Text style={styles.leadItem}>
                  {`• ${x.name}`}<Text style={styles.small}>{` — ${x.issuer}`}</Text>
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.source}>{t('Source: {source}', { source: tSource(SRC.CE) })}</Text>
          </View>
        ) : null}
        {description ? (
          <Text style={styles.description} onPress={longText ? () => setMore(!more) : undefined}>
            {longText && !more ? `${description.slice(0, 240).replace(/\s+\S*$/, '')}… ` : `${description} `}
            {longText ? <Text style={styles.link}>{more ? t('Less') : t('More')}</Text> : null}
          </Text>
        ) : null}

        {/* Results of past students */}
        <Text style={styles.subhead}>{t('Results of past students')}</Text>
        {ce ? (
          <Text style={styles.small}>{t('This course is not on the US Department of Labor list of approved training programs, so there are no official results for it.')}</Text>
        ) : anyResult ? (
          <View style={styles.rows}>
            {results.map(([key, v]) => (
              <View key={key} style={styles.row}>
                <Text style={styles.rowKey}>{key}</Text>
                <Text style={[styles.rowVal, v === NOT_REPORTED() && styles.rowNone]}>{v}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.small}>{t('The provider did not report results for this course (small programs often don’t).')}</Text>
        )}
        {ce ? (
          <Text style={styles.source}>
            {t('Source: {source}', { source: tSource(SRC.CE) })} — {t('as published by the provider')}
            {updated ? ` (${t('updated {date}', { date: updated })})` : ''}
          </Text>
        ) : (
          <Text style={styles.source}>
            {t('Source: {source}', { source: tSource(TRAINING_SOURCE) })}
            {c.reported_at ? ` (${t('reported {year}', { year: c.reported_at.slice(0, 4) })})` : ''}
            {yearlyPay != null ? `. ${t('Yearly pay: {source}', { source: tSource(estimate([SRC.DOL], c.reported_at?.slice(0, 4))) })} — ${t('pay in the 2nd quarter after the course × 4')}` : ''}
          </Text>
        )}
        {c.ce_finder_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(c.ce_finder_url!)} activeOpacity={0.7} style={styles.finderRow}>
            <Icon name="f:external-link" size={12} color={Colors.primaryOnDark} />
            <Text style={styles.link}>{ce ? t('See this course on Credential Finder') : t('Also listed on Credential Finder')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* How to reach them */}
        <Text style={styles.subhead}>{t('Contact the provider')}</Text>
        {status === 'loading' ? (
          <View style={styles.loading}>
            <ActivityIndicator color={Colors.accent} size="small" />
            <Text style={styles.small}>{t('Looking up their phone, email and website…')}</Text>
          </View>
        ) : rows.length ? (
          <>
            {rows.map((r) => (
              <TouchableOpacity key={r.label} style={styles.contactRow} onPress={() => Linking.openURL(r.open)} activeOpacity={0.7}>
                <Icon name={r.icon} size={15} color={Colors.primaryOnDark} />
                <Text style={styles.contactLabel}>{r.label}</Text>
                <Text style={styles.contactValue} numberOfLines={1}>{r.value}</Text>
              </TouchableOpacity>
            ))}
            {contact ? (
              <Text style={styles.source}>
                {t('Found on the provider’s website on {date}. Check with the provider before you sign up.', { date: new Date(contact.foundAt).toLocaleDateString() })}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.small}>{t('We couldn’t find their contact details online. Search for “{provider}” to reach them.', { provider: c.provider })}</Text>
        )}
      </Card>
    </View>
  );
}

/** A course found by the web search: what the page says, and how to reach the provider */
function WebCourseDetails({ course: c }: { course: ShortCourse }) {
  const w = c.web!;
  const rows: Array<{ icon: string; label: string; value: string; open: string }> = [
    { icon: 'f:external-link', label: t('Course page'), value: host(w.url), open: w.url },
    ...(w.phone ? [{ icon: 'f:phone', label: t('Call'), value: w.phone, open: `tel:${w.phone.replace(/\D/g, '')}` }] : []),
    ...(w.email ? [{ icon: 'f:mail', label: t('Email'), value: w.email, open: `mailto:${w.email}` }] : []),
  ];
  const length = w.duration ?? (w.hours ? t('About {hours} hours', { hours: Math.round(w.hours) }) : null);
  return (
    <View style={{ marginBottom: 8 }}>
      <SectionLabel icon="f:book-open">{t('About this course')}</SectionLabel>
      <Card>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.provider}>{w.provider}</Text>
            {w.location ? <Text style={styles.small}>{w.location}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.cost}>{w.price ?? '—'}</Text>
            <Text style={styles.costLabel}>{w.price && w.price_source ? t('price from {site}', { site: host(w.price_source) }) : t('price not listed')}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Icon name="f:monitor" size={12} color={Colors.slate} />
            <Text style={styles.metaText}>{t(FORMAT[w.format] ?? 'Online')}</Text>
          </View>
          {length ? (
            <View style={styles.metaItem}>
              <Icon name="f:clock" size={12} color={Colors.slate} />
              <Text style={styles.metaText}>{length}</Text>
            </View>
          ) : null}
        </View>
        {w.credential ? <Text style={styles.credential}>{t('You earn: {credential}', { credential: w.credential })}</Text> : null}
        {w.why ? <Text style={styles.description}>{w.why}</Text> : null}

        <Text style={styles.subhead}>{t('Results of past students')}</Text>
        <Text style={styles.small}>{t('This course is not on the US Department of Labor list of approved training programs, so there are no official results for it.')}</Text>

        <Text style={styles.subhead}>{t('Contact the provider')}</Text>
        {rows.map((r) => (
          <TouchableOpacity key={r.label} style={styles.contactRow} onPress={() => Linking.openURL(r.open)} activeOpacity={0.7}>
            <Icon name={r.icon} size={15} color={Colors.primaryOnDark} />
            <Text style={styles.contactLabel}>{r.label}</Text>
            <Text style={styles.contactValue} numberOfLines={1}>{r.value}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.source}>
          {t('Found by web search on {date}. Prices and dates change — confirm with the provider before you enroll.', { date: new Date(w.foundAt).toLocaleDateString() })}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  provider: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 20 },
  small: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17 },
  cost: { fontSize: 20, fontFamily: Fonts.displayBlack, color: Colors.positive },
  costLabel: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.faint },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.slate },
  credential: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSoft, marginTop: 8 },
  description: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 19, marginTop: 8 },
  link: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.primaryOnDark },
  leads: { marginTop: 4 },
  leadItem: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.primaryOnDark, lineHeight: 18, marginTop: 2 },
  finderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  subhead: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1, color: Colors.slate, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  rows: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowKey: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.muted },
  rowVal: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.text },
  rowNone: { fontFamily: Fonts.regular, color: Colors.faint },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, lineHeight: 16, marginTop: 6 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  contactLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text, width: 92 },
  contactValue: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: Colors.primaryOnDark, textAlign: 'right' },
});
