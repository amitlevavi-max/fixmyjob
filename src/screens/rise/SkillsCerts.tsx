import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useUserStore } from '../../store/userStore';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Chip from '../../components/Chip';
import Icon from '../../components/Icon';
import Notice from '../../components/Notice';
import SectionLabel from '../../components/SectionLabel';
import { Headline, Eyebrow } from '../../components/Typography';
import { Colors, Fonts } from '../../theme';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { t } from '../../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'SkillsCerts'>;

interface CareerData {
  skills: string[];
  certifications: string[];
  timelineMonths: { min: number; max: number };
  timelineNote: string;
}

export default function SkillsCertsScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuthStore();
  const {
    profile,
    matchedOccupation,
    targetCareerRole,
    targetCareerTitle,
    markedSkills: storedMarkedSkills,
    setMarkedSkills,
    setTargetCareerCerts,
    toggleMarkedSkill,
  } = useUserStore();

  const currentRole = matchedOccupation?.title ?? profile.role ?? 'your current role';
  const targetRole = targetCareerRole ?? 'the next level';

  const [careerData, setCareerData] = useState<CareerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local Set for O(1) lookups — synced from/to the Zustand array
  const [markedSkills, setLocalMarked] = useState<Set<string>>(new Set(storedMarkedSkills));
  // Track saving state per item to show optimistic feedback
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // ── Load from Edge Function ───────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch skills/certs from Claude
        const { data: fnData, error: fnError } = await supabase.functions.invoke('ask-career', {
          body: { currentRole, targetRole },
        });

        if (fnError || !fnData) {
          setError(t("Couldn't load the skills list — please try again."));
          setLoading(false);
          return;
        }

        setCareerData(fnData as CareerData);
        // Missing certifications become opportunities later on
        setTargetCareerCerts((fnData as CareerData).certifications ?? []);

        // 2. Load user's existing marks from DB
        if (user?.id) {
          const { data: dbRows } = await supabase
            .from('user_skills')
            .select('skill')
            .eq('user_id', user.id)
            .eq('has_it', true);

          if (dbRows) {
            const names = dbRows.map((r: { skill: string }) => r.skill);
            setLocalMarked(new Set(names));
            setMarkedSkills(names); // sync to store
          }
        }
      } catch {
        setError(t('Network error — check your connection and try again.'));
      } finally {
        setLoading(false);
      }
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRole, targetRole]);

  // ── Toggle a skill/cert ───────────────────────────────────────────────────
  const toggle = useCallback(async (item: string, skillType: 'skill' | 'certification') => {
    if (!user?.id) return;

    const hadIt = markedSkills.has(item);
    const newHasIt = !hadIt;

    // Optimistic update (local Set + Zustand array)
    setLocalMarked((prev) => {
      const next = new Set(prev);
      if (newHasIt) next.add(item);
      else next.delete(item);
      return next;
    });
    toggleMarkedSkill(item); // sync to store

    setSaving((prev) => new Set(prev).add(item));

    try {
      if (newHasIt) {
        await supabase.from('user_skills').upsert({
          user_id: user.id,
          skill: item,
          skill_type: skillType,
          has_it: true,
          target_role: targetRole,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,skill' });
      } else {
        await supabase
          .from('user_skills')
          .update({ has_it: false, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('skill', item);
      }
    } catch {
      // Revert on error
      setLocalMarked((prev) => {
        const next = new Set(prev);
        if (hadIt) next.add(item);
        else next.delete(item);
        return next;
      });
      toggleMarkedSkill(item); // revert store too
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(item);
        return next;
      });
    }
  }, [user?.id, markedSkills, targetRole]);

  const totalItems = (careerData?.skills.length ?? 0) + (careerData?.certifications.length ?? 0);
  const markedCount = [...markedSkills].filter(
    (s) => careerData?.skills.includes(s) || careerData?.certifications.includes(s)
  ).length;

  const timelineLabel = careerData
    ? `${careerData.timelineMonths.min}–${careerData.timelineMonths.max} months`
    : null;

  const progressPct = totalItems > 0 ? markedCount / totalItems : 0;

  return (
    <Screen
      footer={<Button label={t('What does it pay? →')} onPress={() => navigation.navigate('NextLevelPay')} />}
    >
      <TopBar onBack={() => navigation.goBack()} step={2} total={3} />

      <Eyebrow>{t('Seniority · Insight 2 of 3')}</Eyebrow>
      <Headline accent={targetCareerTitle ?? t('the next level')} accentBreak>
        {t('Skills to become')}
      </Headline>

      {loading && (
        <Card style={styles.loading}>
          <ActivityIndicator color={Colors.accent} size="small" />
          <Text style={styles.loadingText}>{t('Analyzing career path…')}</Text>
        </Card>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      {careerData && !loading && (
        <>
          {/* Progress meter */}
          {totalItems > 0 && (
            <Card variant={markedCount > 0 ? 'positive' : 'default'}>
              <View style={styles.meterHead}>
                <Icon
                  name={markedCount > 0 ? 'f:check-circle' : 'gesture-tap'}
                  size={20}
                  color={markedCount > 0 ? Colors.positive : Colors.accentHi}
                />
                <Text style={styles.meterText}>
                  {markedCount > 0
                    ? t('You have {n} of {total} — keep tapping', { n: markedCount, total: totalItems })
                    : t('Tap the ones you already have ({total} total)', { total: totalItems })}
                </Text>
              </View>
              <View style={styles.meterTrack}>
                <View style={[styles.meterFill, { width: `${progressPct * 100}%` as any }]} />
              </View>
            </Card>
          )}

          {careerData.skills.length > 0 && (
            <>
              <SectionLabel icon="star-outline">{t('Skills')}</SectionLabel>
              <View style={styles.chipWrap}>
                {careerData.skills.map((skill) => (
                  <Chip
                    key={skill}
                    label={skill}
                    tone="positive"
                    selected={markedSkills.has(skill)}
                    loading={saving.has(skill)}
                    disabled={saving.has(skill)}
                    onPress={() => toggle(skill, 'skill')}
                  />
                ))}
              </View>
            </>
          )}

          {careerData.certifications.length > 0 && (
            <>
              <SectionLabel icon="certificate-outline">{t('Certifications')}</SectionLabel>
              <View style={styles.chipWrap}>
                {careerData.certifications.map((cert) => (
                  <Chip
                    key={cert}
                    label={cert}
                    icon="school-outline"
                    tone="positive"
                    selected={markedSkills.has(cert)}
                    loading={saving.has(cert)}
                    disabled={saving.has(cert)}
                    onPress={() => toggle(cert, 'certification')}
                  />
                ))}
              </View>
            </>
          )}

          {timelineLabel && (
            <Notice tone="accent" icon="f:clock" title={timelineLabel}>
              {careerData.timelineNote}
            </Notice>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.muted },
  meterHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  meterText: { flex: 1, fontSize: 15, fontFamily: Fonts.bold, color: Colors.text },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(147,174,221,0.2)', overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: Colors.positive },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
});
