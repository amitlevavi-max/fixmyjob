/**
 * "Are you a member of a union?" — asked only inside the union action and in
 * Profile, never in onboarding (Amit, 2026-11-13). Answers save at once.
 * Options: a member of the union we suggest · of a different union (which one
 * is optional) · no · I don't know. A member (either kind) no longer gets the
 * union suggestion; a plan decision on it is cleared.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useUserStore, type UnionMembership } from '../store/userStore';
import { unionById, UNION_BENEFITS, type UnionInfo } from '../data/unionDirectory';
import { useUserUnion, UNION_ID, isUnionMember } from '../lib/unionMembership';
import Card from './Card';
import Chip from './Chip';
import Button from './Button';
import GhostButton from './GhostButton';
import TextField from './TextField';
import Icon from './Icon';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

/** "Teamsters" → "the Teamsters" where that's how it's said */
export function unionName(u: UnionInfo): string {
  return u.withThe ? t('the {union}', { union: u.short }) : u.short;
}

/** "Member of the Teamsters" / "Member of another union: SEIU" / "Not a union member" — for Profile */
export function membershipSummary(m: UnionMembership | null): string | null {
  if (!m) return null;
  if (m.status === 'member') {
    const u = unionById(m.unionId);
    return u ? t('Member of {union}', { union: unionName(u) }) : t('Union member');
  }
  if (m.status === 'other') {
    return m.otherName ? t('Member of another union: {name}', { name: m.otherName }) : t('Member of another union');
  }
  if (m.status === 'no') return t('Not a union member');
  return t('I don’t know');
}

/** What union members can get — a list inside the union action */
export function UnionBenefits() {
  return (
    <Card style={{ marginBottom: 10 }}>
      <Text style={styles.kicker}>{t('WHAT UNION MEMBERS CAN GET')}</Text>
      {UNION_BENEFITS.map((b) => (
        <View key={b} style={styles.benefitRow}>
          <Icon name="f:check" size={16} color={Colors.positive} />
          <Text style={styles.benefit}>{t(b)}</Text>
        </View>
      ))}
      <Text style={styles.help}>{t('Benefits differ by union and local. Ask the union which ones you would get.')}</Text>
    </Card>
  );
}

export default function UnionMembershipQuestion() {
  const { unionMembership, setUnionMembership, planDecisions, setPlanDecision } = useUserStore();
  const union = useUserUnion();
  const [editing, setEditing] = useState(!unionMembership);
  // The member of the union we suggest is "member"; with no union for the job, "Yes" means another union
  const [askOther, setAskOther] = useState(unionMembership?.status === 'other');
  const [otherName, setOtherName] = useState(unionMembership?.otherName ?? '');

  // Already a member → the action leaves the plan and the suggestions
  const member = isUnionMember(unionMembership);
  useEffect(() => {
    if (member && planDecisions[UNION_ID]) setPlanDecision(UNION_ID, null);
  }, [member]);

  function answer(status: UnionMembership['status']) {
    if (status === 'other') { setAskOther(true); return; }
    setAskOther(false);
    setUnionMembership({ status, unionId: status === 'member' ? union?.id ?? null : null, otherName: null });
    setEditing(false);
  }
  function saveOther(withName: boolean) {
    const name = otherName.trim();
    setUnionMembership({ status: 'other', unionId: null, otherName: withName && name ? name.slice(0, 80) : null });
    setEditing(false);
  }
  function cancel() {
    setAskOther(unionMembership?.status === 'other');
    setOtherName(unionMembership?.otherName ?? '');
    setEditing(false);
  }

  // The saved "member" answer names a different union than we now suggest (e.g. the job changed)
  const memberOfThis = unionMembership?.status === 'member' && !!union && unionMembership.unionId === union.id;

  if (!editing && unionMembership) {
    const result = member
      ? (union && !memberOfThis
        ? t('You’re already in a union, so we won’t suggest {union}. Ask your union which member benefits you can use.', { union: unionName(union) })
        : t('You’re already a member. Ask your union which member benefits you can use.'))
      : union
        ? t('It’s worth contacting {union} to see what you would get.', { union: unionName(union) })
        : null;
    return (
      <Card style={{ marginBottom: 10 }}>
        <Text style={styles.kicker}>{t('YOUR UNION')}</Text>
        <Text style={styles.answer}>{membershipSummary(unionMembership)}</Text>
        {result && (
          <View style={styles.resultRow}>
            <View style={[styles.dot, { backgroundColor: member ? Colors.positive : Colors.accent }]} />
            <Text style={styles.result}>{result}</Text>
          </View>
        )}
        <GhostButton label={t('Change my answer')} onPress={() => setEditing(true)} />
      </Card>
    );
  }

  return (
    <Card variant="accent" style={{ marginBottom: 10 }}>
      <Text style={styles.kicker}>{t('YOUR UNION')}</Text>
      <Text style={styles.prompt}>{t('Are you a member of a union?')}</Text>
      <View style={styles.chips}>
        {union ? (
          <>
            <Chip
              label={t('Yes, {union}', { union: union.short })}
              selected={!askOther && unionMembership?.status === 'member' && unionMembership.unionId === union.id}
              onPress={() => answer('member')}
            />
            <Chip label={t('Yes, a different union')} selected={askOther} onPress={() => answer('other')} />
          </>
        ) : (
          <Chip label={t('Yes')} selected={askOther} onPress={() => answer('other')} />
        )}
        <Chip label={t('No')} selected={!askOther && unionMembership?.status === 'no'} onPress={() => answer('no')} />
        <Chip label={t('I don’t know')} selected={!askOther && unionMembership?.status === 'unsure'} onPress={() => answer('unsure')} />
      </View>

      {askOther && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.prompt}>{t('Which union? (optional)')}</Text>
          <Text style={styles.help}>{t('You don’t have to tell us.')}</Text>
          <TextField value={otherName} onChangeText={setOtherName} placeholder={t('Union name')} icon="handshake-outline" />
          <View style={styles.row}>
            <Button size="sm" label={t('Save')} disabled={!otherName.trim()} onPress={() => saveOther(true)} />
            <Button size="sm" variant="secondary" label={t('Prefer not to say')} onPress={() => saveOther(false)} />
          </View>
        </View>
      )}
      {unionMembership && <GhostButton label={t('Cancel')} onPress={cancel} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1, color: Colors.slate, marginBottom: 8 },
  prompt: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text, lineHeight: 22, marginBottom: 6 },
  help: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.muted, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  answer: { fontFamily: Fonts.semiBold, fontSize: 15, color: Colors.text, marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  result: { flex: 1, fontFamily: Fonts.bold, fontSize: 15, color: Colors.text, lineHeight: 21 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  benefit: { flex: 1, fontFamily: Fonts.medium, fontSize: 15, color: Colors.textSoft, lineHeight: 21 },
});
