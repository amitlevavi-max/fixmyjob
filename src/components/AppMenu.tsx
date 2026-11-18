/**
 * Fix My Job menu — the app-icon button in the top-left corner of every screen.
 * Tapping it opens a small menu with the out-of-the-way functions:
 *   Data sources · Privacy statement · Please delete my data · Support · Log out
 * Web pages open in an in-app browser tab (Chrome Custom Tab / Safari view),
 * so the user never leaves the app. Log out only shows when signed in.
 */
import React, { useRef, useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import Icon from './Icon';
import { Colors, Fonts } from '../theme';
import { useAuthStore } from '../store/authStore';
import { PRIVACY_URL, DELETE_DATA_URL } from '../config/share';
import { t } from '../i18n';

const MARK = require('../../assets/logo.png');

interface AppMenuProps {
  /** Custom trigger (e.g. the full logo on the welcome screen). Default: the app-icon mark. */
  children?: React.ReactNode;
  size?: number;
}

type MenuUser = { user_metadata?: Record<string, any> } | null;

/**
 * The name we show for the user: the username they chose at sign-up, or —
 * for Google sign-in, which has no username — their name from Google.
 * Never the email address.
 */
export function displayName(user: MenuUser): string | null {
  const m = user?.user_metadata ?? {};
  for (const v of [m.username, m.given_name, m.full_name, m.name]) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** First letter (any alphabet) or digit of the display name, or null */
export function initialOf(user: MenuUser): string | null {
  const name = displayName(user);
  const ch = name ? Array.from(name).find((c) => c.toUpperCase() !== c.toLowerCase() || /[0-9]/.test(c)) : undefined;
  return ch ? ch.toUpperCase() : null;
}

const SIGNED_OUT_SCREENS = ['Welcome', 'SignIn', 'SignUp'];

export async function openInApp(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: Colors.ink,
      controlsColor: Colors.accentHi,
      enableBarCollapsing: true,
      showTitle: true,
    });
  } catch {
    Alert.alert(t('Could not open the page'), t('Please check your internet connection and try again.'));
  }
}

export default function AppMenu({ children, size = 36 }: AppMenuProps) {
  const navigation = useNavigation<any>();
  const { user: sessionUser, signOut } = useAuthStore();
  // The welcome, sign-in and sign-up screens never show who is signed in
  // (a session saved on the phone may belong to someone else)
  const routeName = useRoute().name;
  const user = SIGNED_OUT_SCREENS.includes(routeName) ? null : sessionUser;
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 60, left: 16 });

  function show() {
    trigger.current?.measureInWindow((x, y, _w, h) => {
      setPos({ top: y + h + 8, left: Math.max(8, x) });
      setOpen(true);
    });
  }

  function pick(action: () => void) {
    setOpen(false);
    // let the menu close before opening a page or screen
    setTimeout(action, 150);
  }

  function confirmLogOut() {
    Alert.alert(t('Log out?'), t('You can sign back in any time — your answers and plan are saved.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Log out'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
        },
      },
    ]);
  }

  const items: { icon: string; label: string; onPress: () => void; external?: boolean; danger?: boolean }[] = [
    { icon: 'f:database', label: 'Data sources', onPress: () => navigation.navigate('DataSources') },
    { icon: 'f:shield', label: 'Privacy statement', onPress: () => openInApp(PRIVACY_URL), external: true },
    { icon: 'f:trash-2', label: 'Please delete my data', onPress: () => openInApp(DELETE_DATA_URL), external: true },
  ];
  items.push({ icon: 'f:life-buoy', label: 'Support', onPress: () => navigation.navigate('Support') });
  if (user) items.push({ icon: 'f:log-out', label: 'Log out', onPress: confirmLogOut, danger: true });

  return (
    <>
      <View ref={trigger} collapsable={false}>
      <TouchableOpacity
        onPress={show}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t(user ? 'Account menu' : 'Fix My Job menu')}
      >
        {children ?? (user ? (
          // Signed in: a round avatar with the first letter of the person's name
          <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
            {initialOf(user)
              ? <Text style={[styles.avatarLetter, { fontSize: size * 0.48 }]}>{initialOf(user)}</Text>
              : <Icon name="f:user" size={size * 0.5} color="#fff" />}
          </View>
        ) : (
          <Image source={MARK} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="contain" />
        ))}
      </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('Close menu')}>
          <View style={[styles.panel, { top: pos.top, left: pos.left }]}>
            {displayName(user) ? (
              <View style={styles.who}>
                <Text style={styles.whoLabel}>{t('Signed in as')}</Text>
                <Text style={styles.whoEmail} numberOfLines={1}>{displayName(user)}</Text>
              </View>
            ) : null}
            {items.map((it, i) => (
              <TouchableOpacity
                key={it.label}
                style={[styles.item, (i > 0 || !!displayName(user)) && styles.itemBorder]}
                onPress={() => pick(it.onPress)}
                activeOpacity={0.7}
                accessibilityRole={it.external ? 'link' : 'button'}
              >
                <Icon name={it.icon} size={18} color={it.danger ? Colors.accentHi : Colors.slate} />
                <Text style={[styles.label, it.danger && { color: Colors.accentHi }]}>{t(it.label)}</Text>
                {it.external ? <Icon name="f:external-link" size={14} color={Colors.faint} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  who: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, maxWidth: 300 },
  whoLabel: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.slate },
  whoEmail: { fontFamily: Fonts.semiBold, fontSize: 14, color: Colors.text, marginTop: 2 },
  avatar: {
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  avatarLetter: { fontFamily: Fonts.bold, color: '#fff', includeFontPadding: false, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(5,11,20,0.45)' },
  panel: {
    position: 'absolute',
    minWidth: 250,
    backgroundColor: Colors.ink,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    paddingVertical: 4,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  itemBorder: { borderTopWidth: 1, borderTopColor: Colors.line },
  label: { flex: 1, fontFamily: Fonts.semiBold, fontSize: 15, color: Colors.text },
});
