import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useUserStore } from '../store/userStore';
import { WHD, STATE_LABOR_OFFICES } from '../data/laborOffices';
import { STATE_WAGE_LAWS, FEDERAL_MINIMUM, applicableMinimum } from '../data/wageLaws';
import Icon from './Icon';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';

/** Links to the government offices where a worker can file a wage complaint. */
export default function WageClaimLinks() {
  const { locationState, locationIsMetro, locationMetro } = useUserStore();
  const office = locationState ? STATE_LABOR_OFFICES[locationState] : undefined;
  const stateName = locationState ? STATE_WAGE_LAWS[locationState]?.name : undefined;
  const min = applicableMinimum(locationState, { isMetro: locationIsMetro, metro: locationMetro });
  const stateIsHigher = !!stateName && min.rate > FEDERAL_MINIMUM;

  const open = (url: string) => Linking.openURL(url);

  return (
    <View style={styles.box}>
      {office && (
        <LinkRow
          icon="office-building-outline"
          title={office.agency}
          sub={
            stateIsHigher
              ? t("Best for {state}'s {rate} minimum — federal only enforces $7.25", { state: stateName, rate: `$${min.rate.toFixed(2)}` })
              : t('Your state labor office')
          }
          primary={stateIsHigher}
          onPress={() => open(office.url)}
        />
      )}
      <LinkRow
        icon="bank-outline"
        title={t('Contact the US Dept. of Labor online')}
        sub={t('Wage and Hour Division — starts a federal complaint')}
        primary={!stateIsHigher}
        onPress={() => open(WHD.onlineUrl)}
      />
      <LinkRow
        icon="phone-outline"
        title={t('Call {phone}', { phone: WHD.phone })}
        sub={t('Free and confidential')}
        onPress={() => open(WHD.phoneUrl)}
      />
      <LinkRow
        icon="clipboard-check-outline"
        title={t('What to have ready')}
        sub={t('Employer details, dates, hours worked, pay stubs')}
        onPress={() => open(WHD.checklistUrl)}
      />
      {!office && (
        <Text style={styles.hint}>{t('Set your state in the minimum wage check above to see your state labor office.')}</Text>
      )}
    </View>
  );
}

function LinkRow({ icon, title, sub, onPress, primary }: {
  icon: string; title: string; sub: string; onPress: () => void; primary?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.row, primary && styles.rowPrimary]} onPress={onPress} activeOpacity={0.8}>
      <Icon name={icon} size={20} color={primary ? Colors.accentHi : Colors.slate} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Icon name="f:external-link" size={15} color={Colors.slate} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, marginTop: -2, marginBottom: 6, marginLeft: 22, paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: Colors.accentLine },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  rowPrimary: { borderColor: Colors.accent, backgroundColor: 'rgba(242,100,25,0.10)' },
  title: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  sub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 1, lineHeight: 16 },
  hint: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.accentHi },
});
