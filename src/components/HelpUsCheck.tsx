/**
 * Inside a Claim my rights task: the questions that settle it ("Help us
 * check"), one at a time, each with "Not sure" and "Skip". Every answer is a
 * saved fact, so it is never asked again and updates every right that uses it.
 * Then: what the answers mean, "Faster: add a pay stub" (coming soon — taps
 * counted), and once per user the employer and union questions.
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useUserStore } from '../store/userStore';
import { useRightsCheck } from '../lib/rightsCheck';
import { QUESTIONS, type QKey } from '../lib/rightsFacts';
import { answerRightsQuestion, skipRightsQuestion, unskipRightsQuestions } from '../lib/rightsAnswers';
import Card from './Card';
import Chip from './Chip';
import Button from './Button';
import GhostButton from './GhostButton';
import TextField from './TextField';
import ComingSoonButton from './ComingSoonButton';
import { STATUS_COLOR } from './RightsCheckCard';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

/**
 * How many questions this check has, for "Question 2 of 3". The right only
 * lists the questions still open, so every question seen while the page is
 * open is remembered (answered or skipped ones still count toward the total).
 */
export function useQuestionProgress(rightId: string) {
  const rights = useRightsCheck();
  const open = rights.byId(rightId)?.questions ?? [];
  const seen = useRef(new Set<string>());
  open.forEach((k) => seen.current.add(k));
  const total = seen.current.size;
  return { total, current: total - open.length + 1, left: open.length };
}

export default function HelpUsCheck({ rightId }: { rightId: string }) {
  const rights = useRightsCheck();
  const progress = useQuestionProgress(rightId);
  const r = rights.byId(rightId);
  if (!r) return null;
  const q = r.questions[0];
  const { total, current } = progress;

  return (
    <View style={{ marginBottom: 8 }}>
      {q ? (
        <Card variant="accent">
          <View style={styles.progressHead}>
            <Text style={styles.kicker}>{t('HELP US CHECK')}</Text>
            <Text style={styles.counter}>{t('Question {i} of {n}', { i: current, n: total })}</Text>
          </View>
          <View style={styles.segments}>
            {Array.from({ length: total }).map((_, i) => (
              <View key={i} style={[styles.segment, i < current && styles.segmentOn]} />
            ))}
          </View>
          <QuestionBlock key={q} qkey={q} />
        </Card>
      ) : (
        <Card>
          <View style={styles.resultRow}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[r.status] }]} />
            <Text style={styles.result}>
              {r.status === 'owed'
                ? r.yearly > 0
                  ? t('Based on your answers, you may be owed about {amount} a year.', { amount: `$${r.yearly.toLocaleString()}` })
                  : t('Based on your answers, you may be owed this.')
                : r.status === 'fine' ? t('Based on your answers, this looks fine.')
                : r.status === 'not_required' ? t('No law requires this where you work.')
                : t('We can’t tell yet — your pay stub would show it.')}
            </Text>
          </View>
          <Text style={styles.why}>{r.why}</Text>
          {r.cite ? <Text style={styles.cite}>{t('Rule: {cite}', { cite: r.cite })}</Text> : null}
          {r.skippedQuestions.length > 0 && (
            <GhostButton
              label={t('You skipped {n} — answer now', { n: r.skippedQuestions.length })}
              onPress={() => unskipRightsQuestions(r.skippedQuestions)}
            />
          )}
        </Card>
      )}

      {(r.status === 'check' || r.status === 'owed') && (
        <ComingSoonButton
          feature="pay_stub_reading"
          icon="f:camera"
          label={t('Faster: add a photo of your pay stub')}
          screen="task_detail"
          context={r.id}
        />
      )}

      <AboutYourJob />
    </View>
  );
}

/** One question: single answers save on tap; multi answers with "Save" */
function QuestionBlock({ qkey }: { qkey: QKey }) {
  const q = QUESTIONS[qkey];
  const [picked, setPicked] = useState<Array<string | number>>([]);
  if (!q) return null;
  return (
    <View>
      <Text style={styles.prompt}>{t(q.prompt)}</Text>
      {q.help ? <Text style={styles.help}>{t(q.help)}</Text> : null}
      <View style={styles.chips}>
        {q.options?.map((o) => (
          <Chip
            key={String(o.value)}
            label={t(o.label)}
            selected={picked.includes(o.value)}
            onPress={() => {
              if (q.kind === 'multi') setPicked(picked.includes(o.value) ? picked.filter((x) => x !== o.value) : [...picked, o.value]);
              else answerRightsQuestion(qkey, o.value);
            }}
          />
        ))}
        {q.unsure && <Chip label={t('Not sure')} onPress={() => answerRightsQuestion(qkey, 'unsure')} />}
      </View>
      {q.kind === 'multi' && (
        <View style={styles.multiRow}>
          <Button size="sm" label={t('Save')} disabled={!picked.length} onPress={() => answerRightsQuestion(qkey, picked)} />
          <Button size="sm" variant="secondary" label={t('None of these')} onPress={() => answerRightsQuestion(qkey, [])} />
        </View>
      )}
      <GhostButton label={t('Skip')} onPress={() => skipRightsQuestion(qkey)} />
    </View>
  );
}

/** Employer and union contract — asked once, in the first task opened */
function AboutYourJob() {
  const { profile, rightsFacts } = useUserStore();
  const skipped = new Set(rightsFacts.skipped ?? []);
  const askEmployer = !profile.employer && !skipped.has('employer');
  const askUnion = rightsFacts.union === undefined && !skipped.has('union');
  const [employer, setEmployer] = useState('');
  if (!askEmployer && !askUnion) return null;
  return (
    <Card style={{ marginTop: 10 }}>
      <Text style={styles.kicker}>{t('A BIT MORE ABOUT YOUR JOB')}</Text>
      {askEmployer ? (
        <View>
          <Text style={styles.prompt}>{t(QUESTIONS.employer.prompt)}</Text>
          <Text style={styles.help}>{t(QUESTIONS.employer.help!)}</Text>
          <TextField value={employer} onChangeText={setEmployer} placeholder={t('Company name')} autoCapitalize="words" />
          <View style={styles.multiRow}>
            <Button size="sm" label={t('Save')} disabled={!employer.trim()} onPress={() => answerRightsQuestion('employer', employer)} />
            <Button size="sm" variant="secondary" label={t('Skip')} onPress={() => skipRightsQuestion('employer')} />
          </View>
        </View>
      ) : (
        <QuestionBlock qkey="union" />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1, color: Colors.slate, marginBottom: 8 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  counter: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.accentHi, marginBottom: 8 },
  segments: { flexDirection: 'row', gap: 4, marginBottom: 12 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  segmentOn: { backgroundColor: Colors.accent },
  prompt: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text, lineHeight: 22, marginBottom: 6 },
  help: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.muted, lineHeight: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 4 },
  multiRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  result: { flex: 1, fontFamily: Fonts.bold, fontSize: 15, color: Colors.text, lineHeight: 21 },
  why: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.muted, marginTop: 8, lineHeight: 18 },
  cite: { fontFamily: Fonts.regular, fontSize: 11, color: Colors.slate, marginTop: 6 },
});
