/**
 * A button for a feature that isn't built yet (Amit, 2026-10-21): it looks
 * normal; a tap shows "Coming soon" under it and logs the tap
 * (lib/featureInterest) so we can count taps and unique users before building.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';
import { logFeatureInterest, type Feature } from '../lib/featureInterest';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

export default function ComingSoonButton({ feature, label, icon, screen, context }: {
  feature: Feature; label: string; icon?: string; screen: string; context?: string;
}) {
  const [tapped, setTapped] = useState(false);
  return (
    <View style={styles.wrap}>
      <Button
        label={label}
        icon={icon}
        size="sm"
        variant="secondary"
        onPress={() => { setTapped(true); logFeatureInterest(feature, screen, context); }}
      />
      {tapped && (
        <Text style={styles.soon}>{t('Coming soon — we’re working on this. Thanks for letting us know you want it.')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 6 },
  soon: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.accentHi, marginTop: 6, lineHeight: 18 },
});
