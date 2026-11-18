import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import IconTile from '../components/IconTile';
import Notice from '../components/Notice';
import { Headline, Eyebrow, Lead } from '../components/Typography';
import { Colors, Fonts, Radii } from '../theme';

type Nav = StackNavigationProp<RootStackParamList, 'CVUpload'>;

export default function CVUploadScreen() {
  const navigation = useNavigation<Nav>();
  const { setProfile } = useUserStore();
  const [file, setFile] = useState<{ name: string } | null>(null);
  const [parsing, setParsing] = useState(false);

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ],
      });
      if (!result.canceled && result.assets[0]) {
        setFile({ name: result.assets[0].name });
        simulateParse(result.assets[0].name);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open file. Please try again.');
    }
  }

  function simulateParse(filename: string) {
    setParsing(true);
    // Simulate Gemini parse — in production this calls the Edge Function
    setTimeout(() => {
      setParsing(false);
      setProfile({
        role: 'Warehouse Operative',
        yearsExperience: 4,
        annualEarnings: 28000,
        employer: 'DHL',
      });
      navigation.navigate('DataReview');
    }, 2000);
  }

  return (
    <Screen footer={!file ? <Button label="Choose file" icon="f:upload" onPress={pickFile} /> : undefined}>
      <TopBar onBack={() => navigation.goBack()} step={3} total={4} />

      <Eyebrow>Import · CV</Eyebrow>
      <Headline accent="CV">Upload your</Headline>
      <Lead>We extract your role, experience and earnings in seconds.</Lead>

      <TouchableOpacity
        style={[styles.zone, file && styles.zoneDone]}
        onPress={pickFile}
        activeOpacity={0.8}
        disabled={parsing}
      >
        {parsing ? (
          <>
            <ActivityIndicator color={Colors.accent} size="large" />
            <Text style={styles.zoneLabel}>Reading {file?.name ?? 'your CV'}…</Text>
            <Text style={styles.zoneSub}>Pulling out role, years and pay</Text>
          </>
        ) : file ? (
          <>
            <IconTile icon="f:check" tone="positive" size={56} />
            <Text style={styles.zoneLabel}>{file.name}</Text>
            <Text style={styles.zoneSub}>Parsing your CV…</Text>
          </>
        ) : (
          <>
            <IconTile icon="cloud-upload-outline" tone="accent" size={60} />
            <Text style={styles.zoneLabel}>Tap to choose a file</Text>
            <Text style={styles.zoneSub}>PDF  ·  DOCX  ·  TXT</Text>
          </>
        )}
      </TouchableOpacity>

      <Notice tone="success" icon="f:lock" style={{ marginTop: 16 }}>
        Your CV is processed instantly and never stored on our servers.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  zone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.accentLine,
    borderRadius: Radii.xl,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    backgroundColor: Colors.card,
  },
  zoneDone: {
    borderStyle: 'solid',
    borderColor: 'rgba(34,197,94,0.6)',
  },
  zoneLabel: {
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: Colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  zoneSub: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    letterSpacing: 1,
    color: Colors.slate,
  },
});
