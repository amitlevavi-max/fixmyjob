import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LANGUAGES, Lang, useLangStore, changeLanguage } from '../i18n';
import { useAuthStore } from '../store/authStore';
import Icon from './Icon';
import { Colors, Fonts, Radii } from '../theme';

interface Props {
  /** Save the choice right away (Profile). Before sign-in it is saved when the user signs in. */
  save?: boolean;
  /** Small version for the welcome screen: globe + EN / ES */
  compact?: boolean;
}

/** English | Español switch */
export default function LanguageToggle({ save = false, compact = false }: Props) {
  const lang = useLangStore((s) => s.lang);
  const userId = useAuthStore((s) => s.user?.id);

  function pick(l: Lang) {
    if (l === lang) return;
    if (save) changeLanguage(l, userId);
    else useLangStore.setState({ lang: l });
  }

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Language / Idioma">
      {compact ? <Icon name="f:globe" size={15} color={Colors.slate} style={styles.globe} /> : null}
      {LANGUAGES.map((l) => {
        const on = l.id === lang;
        return (
          <TouchableOpacity
            key={l.id}
            style={[styles.option, compact && styles.optionCompact, on && styles.optionOn]}
            onPress={() => pick(l.id)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={l.label}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{compact ? l.short : l.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: 'rgba(10,22,40,0.7)',
    padding: 3,
  },
  option: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill },
  optionCompact: { paddingHorizontal: 10 },
  optionOn: { backgroundColor: Colors.accent },
  globe: { marginLeft: 6, marginRight: 2 },
  label: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textSoft },
  labelOn: { color: '#fff' },
});
