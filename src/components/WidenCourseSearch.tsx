/**
 * Shown on the stand-in item "Find a short course near you" (Amit, 2026-10-27):
 * no short course was found within the user's driving distance (10 miles to
 * start). Two ways to look again:
 *   1. a ZIP code, so distances are measured from where they live;
 *   2. how far they would drive, 10 to 100 miles.
 * Both are saved to the profile (home_zip…, course_max_miles); the course
 * search in lib/useOpportunities runs again by itself when either changes.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Card from './Card';
import Button from './Button';
import Slider from './Slider';
import ZipPrompt from './ZipPrompt';
import Notice from './Notice';
import Icon from './Icon';
import { useUserStore } from '../store/userStore';
import { courseArea } from '../lib/home';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

export const MIN_MILES = 10;
export const MAX_MILES = 100;

export default function WidenCourseSearch({ searching }: { searching: boolean }) {
  const { homePoint, courseMaxMiles, setCourseMaxMiles, locationIsMetro, locationMetro, locationState, locationStateName } = useUserStore();
  const place = courseArea({ homePoint, locationIsMetro, locationMetro, locationState, locationStateName })?.label ?? null;
  const [miles, setMiles] = useState(courseMaxMiles);
  const [changingZip, setChangingZip] = useState(false);
  // Set once the user gave us something new, so "still nothing" can be said after the next search
  const [tried, setTried] = useState(false);
  const firstZip = useRef(homePoint?.zip);
  useEffect(() => {
    if (homePoint?.zip && homePoint.zip !== firstZip.current) { setTried(true); setChangingZip(false); }
  }, [homePoint?.zip]);
  useEffect(() => { setMiles(courseMaxMiles); }, [courseMaxMiles]);

  function searchFurther() {
    setTried(true);
    setCourseMaxMiles(miles);
  }

  if (searching) {
    return (
      <Card variant="accent" style={styles.card}>
        <View style={styles.searching}>
          <ActivityIndicator color={Colors.accentHi} />
          <Text style={styles.body}>{t('Looking again for a short course within {miles} miles…', { miles: courseMaxMiles })}</Text>
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.wrap}>
      {tried ? (
        <Notice tone="warning" icon="f:search">
          {t('Still no short course within {miles} miles. Try a longer distance.', { miles: courseMaxMiles })}
        </Notice>
      ) : (
        <Notice tone="accent" icon="f:search">
          {place
            ? t('We could not find a short course within {miles} miles of {place}, or online, that fits you. Two things help us look again:', { miles: courseMaxMiles, place })
            : t('We could not find a short course within {miles} miles of you, or online, that fits you. Two things help us look again:', { miles: courseMaxMiles })}
        </Notice>
      )}

      {/* 1. Where they are */}
      <Text style={styles.step}>{t('1. Help us find where you are')}</Text>
      {homePoint && !changingZip ? (
        <TouchableOpacity style={styles.zipRow} onPress={() => setChangingZip(true)} activeOpacity={0.7}>
          <Icon name="f:map-pin" size={14} color={Colors.accentHi} />
          <Text style={styles.zipText}>{t('ZIP code {zip} · change', { zip: homePoint.zip })}</Text>
        </TouchableOpacity>
      ) : (
        <ZipPrompt
          reason={t('So we measure the distance from where you live')}
          compact
          {...(homePoint ? { onSkip: () => setChangingZip(false), skipLabel: t('Cancel') } : {})}
        />
      )}

      {/* 2. How far they would drive */}
      <Text style={styles.step}>{t('2. How far would you drive for a course?')}</Text>
      <Card style={styles.card}>
        <Text style={styles.miles}>{t('{miles} miles', { miles })}</Text>
        <Slider
          value={miles}
          min={MIN_MILES}
          max={MAX_MILES}
          step={5}
          onChange={setMiles}
          minLabel={t('{miles} mi', { miles: MIN_MILES })}
          maxLabel={t('{miles} mi', { miles: MAX_MILES })}
        />
        <Button
          label={t('Look again')}
          icon="f:search"
          size="sm"
          onPress={searchFurther}
          disabled={miles === courseMaxMiles}
          style={{ marginTop: 14 }}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  card: { marginBottom: 10 },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20 },
  step: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, marginTop: 6, marginBottom: 8 },
  zipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 6 },
  zipText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentHi },
  miles: { fontSize: 26, fontFamily: Fonts.displayBold, color: Colors.text, marginBottom: 8, textAlign: 'center' },
});
