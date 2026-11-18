import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import OptionCard from '../components/OptionCard';
import Notice from '../components/Notice';
import { Headline, Eyebrow, Lead } from '../components/Typography';

type Nav = StackNavigationProp<RootStackParamList, 'ImportMethod'>;

const OPTIONS = [
  { icon: 'file-document-outline', label: 'Upload my CV', sub: 'PDF, Word, or text file', screen: 'CVUpload' as const },
  { icon: 'linkedin', label: 'Paste LinkedIn profile', sub: 'Copy your About + Experience', screen: 'LinkedInPaste' as const },
  { icon: 'pencil-outline', label: 'Tell us manually', sub: '4 quick questions', screen: 'ManualEntry' as const },
];

export default function ImportMethodScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <Screen>
      <TopBar onBack={() => navigation.goBack()} step={3} total={4} />

      <Eyebrow>Step 3 · Your work history</Eyebrow>
      <Headline accent="baseline">Let's get your</Headline>
      <Lead>
        Choose how you'd like to share your work details — the more you share, the sharper your results.
      </Lead>

      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <OptionCard
            key={opt.label}
            icon={opt.icon}
            title={opt.label}
            subtitle={opt.sub}
            mode="nav"
            onPress={() => navigation.navigate(opt.screen)}
          />
        ))}
      </View>

      <Notice tone="success" icon="f:lock" style={styles.notice}>
        Your details stay private. We never share them without your OK.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10 },
  notice: { marginTop: 18 },
});
