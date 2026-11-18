import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Logo from './Logo';
import { APP_LINK } from '../config/share';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

interface Props {
  children: React.ReactNode;
  /** True while the picture is being taken — shows the report text and branded footer */
  capturing?: boolean;
  /**
   * The finding in words, printed in the shared picture under the card,
   * e.g. "The median security guard in rural New Hampshire earns $38,000/yr…".
   * Never include the user's own pay.
   */
  caption?: string;
  /** Where the figures come from, e.g. "BLS OEWS May 2025" — printed small */
  source?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Wraps what gets shared as a picture: a solid background (so the image isn't
 * transparent) and, only in the shared picture, the report text, its source
 * and a Fix My Job footer + link.
 */
const ShareFrame = forwardRef<View, Props>(({ children, capturing, caption, source, style }, ref) => (
  <View ref={ref} collapsable={false} style={[styles.frame, capturing && styles.capturing, style]}>
    {children}
    {capturing && caption ? <Text style={styles.caption}>{caption}</Text> : null}
    {capturing && source ? <Text style={styles.source}>{t('Source: {source}', { source })}</Text> : null}
    {capturing ? (
      <View style={styles.footer}>
        <Logo size="sm" tagline={false} />
        <Text style={styles.link}>{APP_LINK.replace(/^https?:\/\//, '')}</Text>
      </View>
    ) : null}
  </View>
));

export default ShareFrame;

const styles = StyleSheet.create({
  frame: { backgroundColor: 'transparent' },
  capturing: { backgroundColor: Colors.denimDark, padding: 14, borderRadius: 18 },
  caption: {
    fontSize: 16, lineHeight: 22, fontFamily: Fonts.semiBold, color: Colors.text,
    marginTop: 2, marginBottom: 6, paddingHorizontal: 2,
  },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.slate, marginBottom: 10, paddingHorizontal: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  link: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.accentHi },
});
