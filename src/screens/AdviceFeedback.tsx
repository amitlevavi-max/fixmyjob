import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Card from '../components/Card';
import Icon from '../components/Icon';
import IconTile from '../components/IconTile';
import TextField from '../components/TextField';
import { Headline, Eyebrow, Lead, Em } from '../components/Typography';
import { Colors, Fonts, Radii } from '../theme';

type Nav = StackNavigationProp<RootStackParamList, 'AdviceFeedback'>;
type Route = RouteProp<RootStackParamList, 'AdviceFeedback'>;

const RATINGS = [
  { value: 1, icon: 'emoticon-sad-outline', label: 'Not\nhelpful' },
  { value: 2, icon: 'emoticon-neutral-outline', label: 'Some-\nwhat' },
  { value: 3, icon: 'emoticon-outline', label: 'Pretty\ngood' },
  { value: 4, icon: 'emoticon-happy-outline', label: 'Very\nhelpful' },
  { value: 5, icon: 'emoticon-excited-outline', label: 'Excellent' },
];

export default function AdviceFeedbackScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { opportunityId, opportunityTitle } = route.params;

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (rating === null) return;
    setSending(true);
    // Stored in Supabase (advice_feedback). A failed save shouldn't block the user.
    const { error } = await supabase.rpc('submit_advice_feedback', {
      p_opportunity_id: opportunityId,
      p_opportunity_title: opportunityTitle,
      p_rating: rating,
      p_comment: comment.trim() || null,
    });
    if (error) console.warn('Feedback not saved:', error.message);
    setSending(false);
    setSubmitted(true);
    setTimeout(() => {
      navigation.navigate('JobOfferOptIn');
    }, 1200);
  }

  if (submitted) {
    return (
      <Screen scrollable={false} cornerMarks>
        <View style={styles.center}>
          <IconTile icon="thumb-up-outline" tone="solid" size={76} />
          <Headline align="center" accent="feedback!" accentBreak>Thanks for the</Headline>
          <Lead align="center">It helps us improve advice for everyone.</Lead>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {rating !== null && <Button label="Submit feedback →" onPress={handleSubmit} loading={sending} />}
          <GhostButton label="Skip" onPress={() => navigation.navigate('JobOfferOptIn')} />
        </>
      }
    >
      <TopBar onBack={() => navigation.goBack()} label="Quick feedback" />

      <Eyebrow>10 seconds</Eyebrow>
      <Headline accent="useful?">Was this advice</Headline>
      <Lead>
        Rate the steps we gave you for <Em color={Colors.text}>{opportunityTitle}</Em>
      </Lead>

      <Card ticks style={styles.ratingCard}>
        <View style={styles.row}>
          {RATINGS.map((r) => {
            const on = rating === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                style={[styles.btn, on && styles.btnOn]}
                onPress={() => setRating(r.value)}
                activeOpacity={0.8}
              >
                <Icon name={r.icon} size={30} color={on ? Colors.accentHi : Colors.slate} />
                <Text style={[styles.label, on && styles.labelOn]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {rating !== null && (
        <TextField
          label="Any extra thoughts? (optional)"
          multiline
          placeholder="What would make this more useful…"
          value={comment}
          onChangeText={setComment}
          style={{ minHeight: 96 }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ratingCard: { paddingHorizontal: 8, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 4 },
  btn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnOn: { borderColor: Colors.accentLine, backgroundColor: Colors.accentSoft },
  label: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.muted, textAlign: 'center', lineHeight: 14 },
  labelOn: { color: Colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
});
