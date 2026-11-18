/**
 * Course providers near the user, found by a live web search (find-courses
 * Edge Function, cached 30 days per course + city). Each price links to the
 * page it was copied from; nothing here comes from the model's memory.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import Card from './Card';
import Icon from './Icon';
import Notice from './Notice';
import SectionLabel from './SectionLabel';
import { Colors, Fonts } from '../theme';
import { supabase } from '../lib/supabase';
import type { CourseArea } from '../lib/home';
import { t, isSpanish } from '../i18n';
import { placeName } from '../lib/format';

interface Course {
  name: string;
  provider: string;
  location: string;
  price: string | null;
  priceSource: string | null;
  duration: string | null;
  url: string;
}

const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
const day = (iso: string) => new Date(iso).toLocaleDateString(isSpanish() ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function CourseFinder({ course, area }: { course: string; area: CourseArea }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);

  const run = useCallback(async (refresh = false) => {
    setStatus('loading');
    try {
      const { data, error } = await supabase.functions.invoke('find-courses', {
        body: { courseKeyword: course, area, refresh },
      });
      if (error || !data?.courses) { setStatus('error'); return; }
      setCourses(data.courses);
      setSearchedAt(data.searchedAt ?? null);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }, [course, area.label]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run(); }, [run]);

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionLabel icon="f:search">{t('Other providers near {place}', { place: placeName(area.label) })}</SectionLabel>
      {status === 'loading' && (
        <Card style={styles.loading}>
          <ActivityIndicator color={Colors.accent} size="small" />
          <Text style={styles.muted}>{t('Searching the web for course providers… this can take up to a minute the first time.')}</Text>
        </Card>
      )}
      {status === 'error' && (
        <Notice tone="danger">
          <Text style={styles.muted}>{t('Couldn\'t search right now.')}</Text>
          <TouchableOpacity onPress={() => run()} activeOpacity={0.7}>
            <Text style={styles.retry}>{t('Try again')}</Text>
          </TouchableOpacity>
        </Notice>
      )}
      {status === 'done' && courses.length === 0 && (
        <Notice tone="info">{t("The web search didn't find providers for this near {place}.", { place: placeName(area.label) })}</Notice>
      )}
      {status === 'done' && courses.map((c, i) => (
        <Card key={`${c.url}-${i}`}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.provider}>{c.provider}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', maxWidth: '40%' }}>
              <Text style={styles.price}>{c.price ?? '—'}</Text>
              {c.price && c.priceSource ? (
                <TouchableOpacity onPress={() => Linking.openURL(c.priceSource!)} activeOpacity={0.7}>
                  <Text style={styles.priceSrc}>{t('price from {site}', { site: host(c.priceSource) })}</Text>
                </TouchableOpacity>
              ) : <Text style={styles.priceSrc}>{t('price not listed')}</Text>}
            </View>
          </View>
          <View style={styles.meta}>
            {c.location ? (
              <View style={styles.metaItem}>
                <Icon name="f:map-pin" size={12} color={Colors.slate} />
                <Text style={styles.metaText}>{c.location}</Text>
              </View>
            ) : null}
            {c.duration ? (
              <View style={styles.metaItem}>
                <Icon name="f:clock" size={12} color={Colors.slate} />
                <Text style={styles.metaText}>{c.duration}</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(c.url)} activeOpacity={0.7} style={styles.urlRow}>
            <Icon name="f:external-link" size={12} color={Colors.primaryOnDark} />
            <Text style={styles.link}>{host(c.url)}</Text>
          </TouchableOpacity>
        </Card>
      ))}
      {status === 'done' && searchedAt ? (
        <Text style={styles.source}>
          {`${t('Found by web search on {date}. Prices and dates change — confirm with the provider before you enroll.', { date: day(searchedAt) })} `}
          <Text style={styles.retry} onPress={() => run(true)}>{t('Search again')}</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muted: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: Colors.muted, lineHeight: 19 },
  retry: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.accentHi, marginTop: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 20 },
  provider: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17 },
  price: { fontSize: 20, fontFamily: Fonts.displayBlack, color: Colors.positive, textAlign: 'right' },
  priceSrc: { fontSize: 10, fontFamily: Fonts.medium, color: Colors.faint, textAlign: 'right', textDecorationLine: 'underline' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.slate },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  link: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.primaryOnDark, textDecorationLine: 'underline' },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, lineHeight: 16, marginTop: 4 },
});
