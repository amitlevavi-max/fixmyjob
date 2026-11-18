import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../theme';

interface ProgressDotsProps {
  total: number;
  current: number;
}

/** Segmented orange progress bar (prefer <TopBar step total /> on new screens) */
export default function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.seg, i < current && styles.segOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  seg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(147,174,221,0.22)',
  },
  segOn: {
    backgroundColor: Colors.accent,
  },
});
