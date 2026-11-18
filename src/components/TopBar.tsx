import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './Icon';
import AppMenu from './AppMenu';
import ShareAppButton from './ShareAppButton';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

interface TopBarProps {
  /** Shows a round back button */
  onBack?: () => void;
  /** Step progress — renders orange segments + "2/4" */
  step?: number;
  total?: number;
  /** Optional label on the right when there is no progress bar */
  label?: string;
  /** Fix My Job menu button in the top-left corner (default on) */
  menu?: boolean;
}

/** Fix My Job menu + back button + segmented progress, shared by every inner screen */
export default function TopBar({ onBack, step, total, label, menu = true }: TopBarProps) {
  const showProgress = !!total && step !== undefined;
  return (
    <View style={styles.row}>
      {menu ? (
        <View style={styles.menuGroup}>
          <AppMenu />
          <ShareAppButton />
        </View>
      ) : null}
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.back}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('Back')}
        >
          <Icon name="f:arrow-left" size={20} color={Colors.text} />
        </TouchableOpacity>
      ) : null}

      {showProgress ? (
        <View style={styles.segments}>
          {Array.from({ length: total! }).map((_, i) => (
            <View key={i} style={[styles.segment, i < step! && styles.segmentOn]} />
          ))}
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {showProgress ? (
        <Text style={styles.count}>
          <Text style={{ color: Colors.accentHi }}>{step}</Text>/{total}
        </Text>
      ) : label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 40,
    marginBottom: 18,
  },
  menuGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: 'rgba(10,22,40,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(147,174,221,0.22)',
  },
  segmentOn: {
    backgroundColor: Colors.accent,
  },
  count: {
    fontFamily: Fonts.displayBold,
    fontSize: 15,
    color: Colors.slate,
    letterSpacing: 1,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: Colors.slate,
    textTransform: 'uppercase',
  },
});
