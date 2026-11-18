/**
 * Opportunities built from the user's own "rise up" results: the next role
 * (AI-suggested or picked by the user) and the certifications recommended for
 * it. Every certification the user did NOT mark as "I have this" becomes an
 * opportunity. The pay figure is the BLS median for the next role where the
 * user lives (stored by the next-move screen) — never an invented number.
 */
import { useMemo } from 'react';
import { useUserStore } from '../store/userStore';
import type { Opportunity } from './opportunityCatalog';
import { t, useLang } from '../i18n';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function buildRiseOpportunities(input: {
  targetTitle: string | null;
  /** SOC of the next role — lists the government-approved training programs for it */
  targetSoc?: string | null;
  certs: string[];
  marked: string[];
  pay: { median: number; source: string; area: string; soc?: string } | null;
  earnings: number;
}): Opportunity[] {
  const { targetTitle, targetSoc, certs, marked, pay, earnings } = input;
  if (!targetTitle) return [];
  const gap = pay && earnings > 0 ? Math.round((pay.median - earnings) / 100) * 100 : 0;
  const payLine = pay ? t('typical pay there is {pay}/yr in {area}', { pay: money(pay.median), area: pay.area }) : null;
  const common = {
    jobFamily: 'All',
    goalAlignment: ['rise_up', 'earn_more'] as Opportunity['goalAlignment'],
    physicalDemand: 'low' as const,
    kind: 'career_move' as const,
    gainAmount: gap > 0 ? gap : 0,
    source: pay?.source,
  };

  const have = new Set(marked);
  const missing = certs.filter((c) => !have.has(c));

  if (missing.length) {
    return missing.map((cert) => ({
      ...common,
      id: `cert:${slug(cert)}`,
      title: t('Get {cert}', { cert }),
      courseKeyword: cert,
      ...(targetSoc ? { trainingSoc: targetSoc } : {}),
      gain: payLine
        ? t('Recommended for {role} — {payLine}', { role: targetTitle, payLine })
        : t('Recommended for {role}', { role: targetTitle }),
      note: t('A certification recommended for your next role, {role}', { role: targetTitle }),
      timeline: t('Depends on the course'),
      steps: [
        { title: t('Ask if your employer pays'), detail: t('Many employers cover training that helps you step up — ask your manager or HR before you pay for it yourself.') },
        { title: t('Find a course'), detail: t("Use the course finder below, or look up {cert} on the certifying organization's website.", { cert }) },
        { title: t('Take the exam'), detail: t('Book the exam once you finish the course. Keep the certificate — employers will ask for it.') },
        { title: t('Use it to move up'), detail: t("Add it to your resume and tell your manager you're aiming for {role}.", { role: targetTitle }) },
      ],
    }));
  }

  // Nothing missing (or no certifications recommended): the move itself
  return [{
    ...common,
    id: `next-role:${slug(targetTitle)}`,
    title: t('Go for {role}', { role: targetTitle }),
    gain: payLine ? t('Your next role — {payLine}', { payLine }) : t('Your next role'),
    note: certs.length ? t('You already have the recommended certifications') : t('The next step up from your current job'),
    timeline: t("When you're ready"),
    steps: [
      { title: t('Tell your manager'), detail: t("Say you want to move up to {role} and ask what they'd need to see from you.", { role: targetTitle }) },
      { title: t('Watch for openings'), detail: t("Internal openings often go to people who asked first — check your company's job board too.") },
      { title: t('Apply elsewhere too'), detail: t('Search job sites for "{role}" near you; your current experience counts.', { role: targetTitle }) },
    ],
  }];
}

/** The rise-up opportunities for the current user (recomputed as they mark certifications). */
export function useRiseOpportunities(): Opportunity[] {
  const { targetCareerTitle, targetCareerSoc, targetCareerCerts, markedSkills, targetCareerPay, profile } = useUserStore();
  const lang = useLang();
  return useMemo(
    () => buildRiseOpportunities({
      targetTitle: targetCareerTitle,
      targetSoc: targetCareerSoc,
      certs: targetCareerCerts,
      marked: markedSkills,
      pay: targetCareerPay,
      earnings: profile.annualEarnings ?? 0,
    }),
    [targetCareerTitle, targetCareerSoc, targetCareerCerts, markedSkills, targetCareerPay, profile.annualEarnings, lang],
  );
}
