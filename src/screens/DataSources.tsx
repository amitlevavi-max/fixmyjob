/**
 * Data sources — every outside source behind the app's numbers, with the
 * credit each one requires. Opened from the Fix My Job menu.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import Icon from '../components/Icon';
import Notice from '../components/Notice';
import { Headline } from '../components/Typography';
import { openInApp } from '../components/AppMenu';
import { Colors, Fonts } from '../theme';
import { DATA_SOURCE_GROUPS, AI_NOTE, INDEPENDENCE_NOTE } from '../data/dataSources';
import { t } from '../i18n';

export default function DataSourcesScreen() {
  const navigation = useNavigation<any>();
  return (
    <Screen>
      <TopBar onBack={() => navigation.goBack()} label={t('Data sources')} />
      <Headline accent={t('sources')}>{t('Our')}</Headline>
      <Text style={styles.lead}>{t('Where every number and fact in Fix My Job comes from. Tap a source to visit it.')}</Text>
      <Notice style={{ marginTop: 14 }}>{t(INDEPENDENCE_NOTE)}</Notice>

      {DATA_SOURCE_GROUPS.map((g) => (
        <View key={g.title} style={{ marginTop: 18 }}>
          <SectionLabel>{t(g.title)}</SectionLabel>
          <Card padded={false}>
            {g.sources.map((s, i) => (
              <TouchableOpacity
                key={s.name}
                style={[styles.row, i > 0 && styles.rowBorder]}
                onPress={s.url ? () => openInApp(s.url!) : undefined}
                disabled={!s.url}
                activeOpacity={0.7}
                accessibilityRole={s.url ? 'link' : 'text'}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{t(s.name)}</Text>
                  <Text style={styles.publisher}>{t(s.publisher)}</Text>
                  <Text style={styles.used}>{t(s.usedFor)}</Text>
                  {s.credit ? <Text style={styles.credit}>{s.credit}</Text> : null}
                </View>
                {s.url ? <Icon name="f:external-link" size={15} color={Colors.faint} style={{ marginTop: 2 }} /> : null}
              </TouchableOpacity>
            ))}
          </Card>
        </View>
      ))}

      <Text style={styles.note}>{t(AI_NOTE)}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: Fonts.regular, fontSize: 15, lineHeight: 21, color: Colors.textSoft, marginTop: 6 },
  row: { flexDirection: 'row', gap: 12, padding: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.line },
  name: { fontFamily: Fonts.semiBold, fontSize: 15, color: Colors.text },
  publisher: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.slate, marginTop: 2 },
  used: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18, color: Colors.muted, marginTop: 6 },
  credit: { fontFamily: Fonts.regular, fontSize: 12, lineHeight: 17, color: Colors.faint, fontStyle: 'italic', marginTop: 6 },
  note: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 19, color: Colors.muted, marginTop: 22 },
});
