/**
 * Share button at the top of the screen, next to the avatar / menu button.
 * Opens the phone's own share sheet (Android / iOS) with the app's store link.
 */
import React from 'react';
import { Platform, Share, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from './Icon';
import { Colors } from '../theme';
import { STORE_LINK } from '../config/share';
import { t } from '../i18n';

export default function ShareAppButton({ size = 36 }: { size?: number }) {
  async function share() {
    const text = t('Try Fix My Job: because hard-working people deserve to get ahead');
    try {
      // iOS shows the link as its own item; Android needs it inside the message
      await Share.share(
        Platform.OS === 'ios'
          ? { message: text, url: STORE_LINK }
          : { message: `${text} ${STORE_LINK}`, title: 'Fix My Job' },
        { dialogTitle: t('Share the app') },
      );
    } catch {
      // user closed the sheet or sharing isn't available — nothing to do
    }
  }

  return (
    <TouchableOpacity
      onPress={share}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={t('Share the app')}
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Icon name="share-variant-outline" size={size * 0.5} color={Colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: 'rgba(10,22,40,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
