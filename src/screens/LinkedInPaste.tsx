import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Card from '../components/Card';
import TextField from '../components/TextField';
import { Headline, Eyebrow } from '../components/Typography';
import { Colors, Fonts } from '../theme';

type Nav = StackNavigationProp<RootStackParamList, 'LinkedInPaste'>;

const STEPS = [
  'Open LinkedIn and go to your profile',
  'Tap "More" → "Save to PDF", or copy your About + Experience sections',
  'Paste the text below',
];

export default function LinkedInPasteScreen() {
  const navigation = useNavigation<Nav>();
  const { setProfile } = useUserStore();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);

  function handleParse() {
    if (text.length < 50) return;
    setParsing(true);
    // Simulate Gemini parse
    setTimeout(() => {
      setParsing(false);
      setProfile({
        role: 'Warehouse Operative',
        yearsExperience: 4,
        annualEarnings: 28000,
        employer: 'DHL',
        skills: ['Forklift (FLT)', 'Health & Safety'],
      });
      navigation.navigate('DataReview');
    }, 1800);
  }

  const tooShort = text.length > 0 && text.length < 50;

  return (
    <Screen
      footer={
        <Button
          label={parsing ? 'Parsing…' : 'Parse profile →'}
          onPress={handleParse}
          disabled={text.length < 50}
          loading={parsing}
        />
      }
    >
      <TopBar onBack={() => navigation.goBack()} step={3} total={4} />

      <Eyebrow>Import · LinkedIn</Eyebrow>
      <Headline accent="LinkedIn profile">Paste your</Headline>

      <Card style={styles.howTo}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </Card>

      <TextField
        multiline
        icon="linkedin"
        placeholder="Paste your LinkedIn profile text here…"
        value={text}
        onChangeText={setText}
      />

      <Text style={[styles.charCount, tooShort && { color: Colors.accentHi }]}>
        {text.length} chars{tooShort ? ' — need at least 50' : ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  howTo: { gap: 12, marginTop: 6, marginBottom: 16 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontFamily: Fonts.displayBold, fontSize: 14, color: Colors.accentHi },
  stepText: { flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20, paddingTop: 2 },
  charCount: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.slate,
    marginTop: 8,
    textAlign: 'right',
  },
});
