import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { useAuthStore } from '../store/authStore';
import { upsertUserProfile, supabase } from '../lib/supabase';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Card from '../components/Card';
import KVRow from '../components/KVRow';
import TextField from '../components/TextField';
import Notice from '../components/Notice';
import { Headline, Eyebrow, Lead } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { formatTenure } from '../lib/format';

type Nav = StackNavigationProp<RootStackParamList, 'DataReview'>;

export default function DataReviewScreen() {
  const navigation = useNavigation<Nav>();
  const { profile, focusGoal: goal, goals, setProfile } = useUserStore();
  const satisfaction = goals[0]?.satisfaction ?? null;
  const { user } = useAuthStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  function formatEarnings(n?: number) {
    if (!n) return '—';
    return `$${n.toLocaleString()}/yr`;
  }

  function startEdit(field: string, current?: string) {
    setEditing(field);
    setEditValue(current || '');
  }

  function saveEdit() {
    if (!editing) return;
    if (editing === 'role') setProfile({ role: editValue });
    else if (editing === 'experience') {
      const years = parseInt(editValue.replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(years)) setProfile({ yearsExperience: years, tenureMonths: years < 5 ? years * 12 : null });
    }
    else if (editing === 'earnings') {
      const n = parseInt(editValue.replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(n) || n < 1000 || n > 1000000) {
        Alert.alert('Check your pay', 'Enter your yearly pay before tax, e.g. 32000.');
        return;
      }
      setProfile({ annualEarnings: n });
    }
    else if (editing === 'employer') setProfile({ employer: editValue });
    setEditing(null);
  }

  const rows = [
    { key: 'role', label: 'Role', value: profile.role || '—' },
    { key: 'experience', label: 'Time in current job', value: formatTenure(profile) ?? '—' },
    { key: 'earnings', label: 'Earnings', value: formatEarnings(profile.annualEarnings) },
    { key: 'employer', label: 'Employer', value: profile.employer || '—' },
  ];

  const missingPay = !profile.annualEarnings;

  async function handleConfirm() {
    if (missingPay) {
      startEdit('earnings');
      return;
    }
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in and try again.');
      return;
    }
    setSaving(true);
    try {
      // Verify the Supabase client has a live session before saving
      const { data: { session: liveSession } } = await supabase.auth.getSession();
      if (!liveSession) {
        Alert.alert('Session expired', 'Your login session expired. Please sign in again.');
        return;
      }
      const error = await upsertUserProfile({
        userId: user.id,
        goal,
        satisfaction,
        role: profile.role,
        yearsExperience: profile.yearsExperience,
        annualEarnings: profile.annualEarnings,
        employer: profile.employer,
        location: profile.location,
        skills: profile.skills,
      });
      if (error) {
        Alert.alert('Save failed', `Could not save your data: ${error.message}\n\nPlease check your connection and try again.`);
        return;
      }
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error. Please try again.');
      return;
    } finally {
      setSaving(false);
    }
    // Next: the licenses the job requires (skipped when there are none), then results
    navigation.navigate('Credentials');
  }

  const isNumeric = editing === 'experience' || editing === 'earnings';

  return (
    <Screen
      footer={
        <Button
          label={missingPay ? 'Add your pay →' : 'Looks right →'}
          onPress={handleConfirm}
          loading={saving}
        />
      }
    >
      <TopBar onBack={() => navigation.goBack()} step={4} total={4} />

      <Eyebrow>Step 4 · Check your details</Eyebrow>
      <Headline accent="we got">Here's what</Headline>
      <Lead>Everything look right? Tap any row to fix it. Your pay is required — it's what we compare.</Lead>

      <Card ticks>
        {rows.map((row, i) => (
          <KVRow
            key={row.key}
            label={row.key === 'earnings' ? 'Earnings (required)' : row.label}
            value={row.value}
            muted={row.value === '—'}
            last={i === rows.length - 1}
            onPress={() => startEdit(row.key,
              row.key === 'experience' ? (profile.yearsExperience != null ? String(profile.yearsExperience) : '')
              : row.key === 'earnings' ? (profile.annualEarnings ? String(profile.annualEarnings) : '')
              : row.value === '—' ? '' : row.value)}
          />
        ))}
      </Card>

      {missingPay ? (
        <Notice tone="accent" icon="f:alert-circle">
          Add your yearly pay (before tax) to see where you stand.
        </Notice>
      ) : (
        <Notice tone="info" icon="f:edit-2">
          Tap the pencil on any row to change it.
        </Notice>
      )}

      {/* Edit sheet */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setEditing(null)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              Edit {rows.find((r) => r.key === editing)?.label}
            </Text>
            <TextField
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              placeholder={editing === 'experience' ? 'Whole years, e.g. 3' : editing === 'earnings' ? 'Yearly pay, e.g. 32000' : 'Enter value…'}
              keyboardType={isNumeric ? 'number-pad' : 'default'}
              returnKeyType="done"
              onSubmitEditing={saveEdit}
              containerStyle={{ marginBottom: 16 }}
            />
            <Button label="Save" onPress={saveEdit} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,10,20,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.denimDark,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: Colors.lineStrong,
    padding: 22,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.lineStrong,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 22,
    fontFamily: Fonts.display,
    textTransform: 'uppercase',
    color: Colors.text,
    marginBottom: 14,
  },
});
