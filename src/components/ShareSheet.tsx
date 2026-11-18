import React, { RefObject, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { captureImage, shareTo, ShareChannel } from '../lib/share';
import { useAuthStore } from '../store/authStore';
import { shareLink } from '../config/share';
import Button from './Button';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';

const CHANNELS: Array<{ id: ShareChannel; label: string; icon: string; color: string }> = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', color: '#25D366' },
  { id: 'messenger', label: 'Messenger', icon: 'facebook-messenger', color: '#0084FF' },
  { id: 'x', label: 'X', icon: 'alpha-x', color: '#FFFFFF' },
  { id: 'instagram', label: 'Instagram', icon: 'instagram', color: '#E1306C' },
  { id: 'other', label: 'More', icon: 'share-variant', color: Colors.slate },
];

interface Props {
  /** View to capture as the shared picture (wrap it in <ShareFrame>) */
  captureRef?: RefObject<any>;
  /** Text before the link, e.g. "I'm in the 62nd percentile…" */
  message: string;
  /** For share statistics */
  screen: string;
  label?: string;
  /** Called before capture so the frame can show its branded footer */
  onCapturing?: (on: boolean) => void;
  variant?: 'primary' | 'secondary';
  /** Where the compact button sits in its row (default: centred) */
  align?: 'center' | 'flex-start' | 'flex-end';
  style?: StyleProp<ViewStyle>;
}

/** "Share" button that opens a sheet: WhatsApp, Messenger, X, Instagram, More. */
export default function ShareButton({ captureRef, message, screen, label = 'Share my result', onCapturing, variant = 'secondary', align = 'center', style }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ShareChannel | null>(null);
  const user = useAuthStore((s) => s.user);
  const refCode = user?.id ? user.id.replace(/-/g, '').slice(0, 8) : null;

  async function go(channel: ShareChannel) {
    setBusy(channel);
    try {
      let image: string | null = null;
      if (captureRef?.current) {
        onCapturing?.(true);
        await new Promise((r) => setTimeout(r, 120));   // let the branded footer render
        image = await captureImage(captureRef).catch(() => null);
        onCapturing?.(false);
      }
      await shareTo(channel, { image, message: `${message} ${shareLink(refCode)}`, screen, refCode });
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        label={t(label)}
        icon="f:share-2"
        variant={variant}
        size="sm"
        style={[styles.compact, { alignSelf: align }, style]}
        onPress={() => setOpen(true)}
      />
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !busy && setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>{t('Share with friends')}</Text>
            <Text style={styles.sub}>{t('Your picture shows your rank — never your pay.')}</Text>
            <View style={styles.grid}>
              {CHANNELS.map((c) => (
                <TouchableOpacity key={c.id} style={styles.item} onPress={() => go(c.id)} disabled={!!busy} activeOpacity={0.7}>
                  <View style={[styles.circle, { borderColor: c.color }]}>
                    {busy === c.id
                      ? <ActivityIndicator color={c.color} />
                      : <MaterialCommunityIcons name={c.icon as any} size={28} color={c.color} />}
                  </View>
                  <Text style={styles.itemLabel}>{t(c.label)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Small pill sized to its label, not the full screen width
  compact: { height: 36, paddingHorizontal: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(5,10,20,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.denimDark, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: Colors.lineStrong, padding: 22, paddingBottom: 36,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.lineStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  sub: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.slate, marginTop: 4, marginBottom: 18 },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  item: { alignItems: 'center', width: 62 },
  circle: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  itemLabel: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSoft, marginTop: 6 },
});
