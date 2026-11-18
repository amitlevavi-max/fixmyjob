import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import Card from '../../components/Card';
import IconTile from '../../components/IconTile';
import Notice from '../../components/Notice';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import MinimumWageCheck from '../../components/MinimumWageCheck';
import { rightsCategories } from '../../data/rightsContent';
import { stateRightsFacts } from '../../data/stateRights';
import { useUserStore } from '../../store/userStore';
import LocationPicker, { LocationResult } from '../../components/LocationPicker';
import Icon from '../../components/Icon';
import { Colors, Fonts } from '../../theme';

type Nav = StackNavigationProp<RootStackParamList, 'RightsDetail'>;
type Route = RouteProp<RootStackParamList, 'RightsDetail'>;

export default function RightsDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { categoryId } = route.params;

  const category = rightsCategories.find((c) => c.id === categoryId);
  const { locationState, locationStateName, locationIsMetro, locationMetro, setLocation } = useUserStore();
  const [showPicker, setShowPicker] = useState(false);
  const stateFacts = category
    ? stateRightsFacts(category.id, locationState, { isMetro: locationIsMetro, metro: locationMetro })
    : [];

  if (!category) {
    return (
      <Screen>
        <TopBar onBack={() => navigation.goBack()} />
        <Headline>Category not found</Headline>
        <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {category.helpLink && (
            <Button
              label="Get official guidance"
              icon="f:external-link"
              onPress={() => Linking.openURL(category.helpLink!)}
            />
          )}
          <Button
            label="Back to Rights Hub"
            variant="secondary"
            size="sm"
            onPress={() => navigation.goBack()}
            style={{ marginTop: 8 }}
          />
        </>
      }
    >
      <TopBar onBack={() => navigation.goBack()} label="Your rights" />

      <View style={styles.head}>
        <IconTile icon={category.lineIcon} tone="accent" size={52} />
        <View style={{ flex: 1 }}>
          <Eyebrow style={{ marginBottom: 0 }}>
            {locationStateName ? `Under US & ${locationStateName} law` : 'Under US law'}
          </Eyebrow>
        </View>
      </View>
      <Headline>{category.label}</Headline>
      <Lead>Your rights in plain English.</Lead>

      {/* Rules where the user works */}
      {stateFacts.length > 0 && (
        <>
          <Text style={styles.section}>IN {locationStateName?.toUpperCase()}</Text>
          <Card variant="accent" padded={false} style={styles.facts}>
            {stateFacts.map((fact, i) => {
              const body = (
                <View style={{ flex: 1 }}>
                  <Text style={styles.factLabel}>{fact.key}</Text>
                  <Text style={[styles.factValue, fact.url ? styles.link : null]}>{fact.value}</Text>
                </View>
              );
              return (
                <View key={fact.key} style={[styles.fact, i === stateFacts.length - 1 && { borderBottomWidth: 0 }]}>
                  <Icon name="f:map-pin" size={16} color={Colors.accentHi} style={{ width: 22, paddingTop: 2 }} />
                  {fact.url ? (
                    <TouchableOpacity style={{ flex: 1, flexDirection: 'row', gap: 8 }} onPress={() => Linking.openURL(fact.url!)}>
                      {body}
                      <Icon name="f:external-link" size={15} color={Colors.accentHi} />
                    </TouchableOpacity>
                  ) : body}
                </View>
              );
            })}
          </Card>
        </>
      )}
      {!locationState && (
        <Notice tone="accent" icon="f:map-pin" title="Where do you work?">
          Rules differ by state.{' '}
          <Text style={styles.link} onPress={() => setShowPicker(true)}>Add your state</Text> to see the ones that apply to you.
        </Notice>
      )}

      <Text style={styles.section}>ACROSS THE US</Text>
      <Card padded={false} style={styles.facts}>
        {category.facts.map((fact, i) => (
          <View key={i} style={[styles.fact, i === category.facts.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={styles.factNum}>{String(i + 1).padStart(2, '0')}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.factLabel}>{fact.key}</Text>
              <Text style={styles.factValue}>{fact.value}</Text>
            </View>
          </View>
        ))}
      </Card>

      {category.id === 'wages_hours' && <MinimumWageCheck />}

      <Notice tone="info" icon="f:book-open" title="Legislation">
        {category.legislation}
        {stateFacts.length > 0 ? ' · State rules checked Oct 2026 — confirm with your state agency.' : ''}
      </Notice>

      <LocationPicker
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(result: LocationResult) => {
          setLocation(result);
          setShowPicker(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  facts: { overflow: 'hidden' },
  fact: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  factNum: { fontFamily: Fonts.displayBold, fontSize: 16, color: Colors.accentHi, width: 22, paddingTop: 1 },
  factLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.slate,
    letterSpacing: 1.2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  factValue: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.text, lineHeight: 22 },
  link: { color: Colors.accentHi, textDecorationLine: 'underline' },
  section: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    color: Colors.slate,
    marginBottom: 8,
    marginTop: 4,
  },
});
