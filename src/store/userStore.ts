import { create } from 'zustand';
import { OccupationWages, matchOccupation, occupationBySoc, CATEGORY_OCCUPATIONS } from '../data/blsOews';
import { fetchOccupationBySoc } from '../lib/occupationSearch';
import type { WorkSchedule } from '../lib/wageCheck';
import { queueProfileSave, savePlan, saveHome, savePlanMeta, saveCredentials, saveCourseMaxMiles, saveHealthCoverage, saveUnionMembership } from '../lib/profileSync';
import type { HomePoint } from '../lib/home';
import type { RightsFacts } from '../lib/rightsFacts';
import { saveRightsAnswers, loadRightsAnswers } from '../lib/profileSync';

// Store field → user_profiles column (saved to Supabase as soon as it changes)
const PROFILE_COLUMNS: Partial<Record<keyof UserProfile, string>> = {
  role: 'role',
  yearsExperience: 'years_experience',
  tenureMonths: 'tenure_months',
  annualEarnings: 'annual_earnings',
  employer: 'employer',
  skills: 'skills',
  hourlyRate: 'hourly_rate',
};

export type PlanDecision = 'in_plan' | 'not_pursuing';

/** What we remember about each suggestion besides the decision */
export interface PlanMeta {
  rating?: 'not' | 'somewhat' | 'very';          // "How useful is this suggestion?"
  reason?: string;                               // why "Not for me"
  firstSeen?: string;                            // first time the user opened it (ISO)
  decidedAt?: string;                            // last Add / Not for me (ISO)
  stepsDone?: number[];                          // checked steps (indexes)
}

/**
 * The user's health insurance, asked only inside the "Ask your employer for
 * health insurance" action and in Profile — never in onboarding (Amit,
 * 2026-11-06). Saved to user_profiles.health_coverage. See lib/healthInsurance.
 */
export interface HealthCoverage {
  /** Health insurance through the user's job? */
  has: 'yes' | 'no' | 'unsure';
  /** What the user pays for it a month ($), when they said */
  monthly?: number | null;
  /** Who it covers */
  covers?: 'single' | 'plus_one' | 'family' | null;
  answeredAt: string;
}

/**
 * Is the user a union member? Asked only inside the union action and in
 * Profile (Amit, 2026-11-13). Saved to user_profiles.union_membership.
 * - member: of the union we suggested (`unionId`, data/unionDirectory)
 * - other:  of a different union (`otherName` if they said which; optional)
 * - no / unsure ("I don't know")
 * A member (either kind) no longer gets the union suggestion.
 */
export interface UnionMembership {
  status: 'member' | 'other' | 'no' | 'unsure';
  unionId?: string | null;
  otherName?: string | null;
  answeredAt: string;
}

export type Goal =
  | 'earn_more'
  | 'rise_up'
  | 'work_life_balance'
  | 'change_careers'
  | 'claim_rights'
  | 'less_physical';

// 1 = worst, 5 = best. The question depends on the goal (see
// SATISFACTION_QUESTIONS in screens/JobSatisfaction), e.g. "earn more" asks
// about pay. Not asked in onboarding any more; optional in Profile.
export type Satisfaction = 1 | 2 | 3 | 4 | 5;

/**
 * One of the user's goals. A user can have several; each is a direction with
 *   - importance  — 1 = most important. The goal the user is focusing on is
 *                   always 1; the others keep their order behind it.
 *   - improvement potential — NOT stored: it's the sourced yearly boost of the
 *                   suggestions linked to the goal, worked out live in
 *                   lib/planView (so it follows pay data and plan changes).
 * Suggestions (action items) link to goals through Opportunity.goalAlignment,
 * so one item can serve several goals (e.g. a minimum-wage claim helps both
 * "Earn more money" and "Claim my rights").
 * A goal is only added when the user picks it as their focus, so only the
 * focus goal is analyzed at first. Goals are never dropped when the focus
 * changes — their suggestions and plan items stay.
 */
export interface UserGoal {
  id: Goal;
  importance: number;
  /** When the user first picked it (ISO) */
  addedAt: string;
  /** Optional answer to this goal's 1–5 question */
  satisfaction?: Satisfaction | null;
}

const GOAL_IDS: Goal[] = ['earn_more', 'rise_up', 'work_life_balance', 'change_careers', 'claim_rights', 'less_physical'];

/** Goals in order of importance (focus goal first) */
export const goalsByImportance = (goals: UserGoal[]) => [...goals].sort((a, b) => a.importance - b.importance);

/** Make `focus` the most important goal (adding it if new); the rest keep their order */
function withFocus(goals: UserGoal[], focus: Goal): UserGoal[] {
  const existing = goals.find((g) => g.id === focus);
  const rest = goalsByImportance(goals).filter((g) => g.id !== focus);
  const first: UserGoal = existing ?? { id: focus, importance: 1, addedAt: new Date().toISOString() };
  return [first, ...rest].map((g, i) => ({ ...g, importance: i + 1 }));
}

/** Saved goals (user_profiles.goals), or the old single goal column */
function goalsFromRow(row: Record<string, any>): UserGoal[] | null {
  if (Array.isArray(row.goals)) {
    const list = row.goals
      .filter((g: any) => g && GOAL_IDS.includes(g.id))
      .map((g: any, i: number) => ({
        id: g.id as Goal,
        importance: Number(g.importance) || i + 1,
        addedAt: String(g.addedAt ?? new Date().toISOString()),
        satisfaction: g.satisfaction ?? null,
      }));
    if (list.length) return goalsByImportance(list).map((g, i) => ({ ...g, importance: i + 1 }));
  }
  if (row.goal && GOAL_IDS.includes(row.goal)) {
    return [{ id: row.goal, importance: 1, addedAt: new Date().toISOString(), satisfaction: row.satisfaction ?? null }];
  }
  return null;
}

export interface UserProfile {
  role?: string;
  /** Whole years in the current job (rounded down) */
  yearsExperience?: number;
  /** Exact months in the current job, when under 5 years */
  tenureMonths?: number | null;
  annualEarnings?: number;
  employer?: string;
  location?: string;
  skills?: string[];
  email?: string;
  /** Base hourly rate, if the user entered one (more precise than annual pay) */
  hourlyRate?: number;
}


export interface UserState {
  // Goals — every goal the user has focused on, most important first
  goals: UserGoal[];
  /** The goal the user is focusing on now (= goals[0]); null before onboarding */
  focusGoal: Goal | null;
  /** Focus on a goal: adds it if new; earlier goals and their plan items stay */
  setFocusGoal: (g: Goal) => void;
  /**
   * The user's other goals besides the main (focus) one (Profile / My plan).
   * Adds new ones after the existing ones; removes unticked ones. Items of a
   * removed goal that are already in the plan stay; its "to review" ones go.
   */
  setOtherGoals: (ids: Goal[]) => void;
  /** Answer to a goal's 1–5 question (Profile) */
  setGoalSatisfaction: (g: Goal, s: Satisfaction | null) => void;

  // Profile
  profile: UserProfile;
  setProfile: (p: Partial<UserProfile>) => void;

  // Physical preferences (less_physical track)
  environmentConcerns: string[];
  setEnvironmentConcerns: (e: string[]) => void;
  physicalConcerns: string[];
  setPhysicalConcerns: (p: string[]) => void;
  primaryConcern: string | null;
  setPrimaryConcern: (c: string) => void;

  // Earnings insight
  earningsPercentile: number | null;
  setEarningsPercentile: (p: number) => void;

  // Matched BLS occupation (set during Calculating screen)
  matchedOccupation: OccupationWages | null;
  /** Explicit choice (null = no match → compare with all US workers). Saved to the profile. */
  setMatchedOccupation: (o: OccupationWages | null) => void;

  // Geographic location for wage normalization
  locationState: string | null;       // state abbreviation, e.g. 'CA'
  locationStateName: string | null;   // full name, e.g. 'California'
  locationIsMetro: boolean | null;
  locationMetro: string | null;       // metro name, e.g. 'Los Angeles'
  locationLabel: string | null;       // human-readable, e.g. 'Los Angeles, CA'
  /** ZIP code → map point + closest metro city (asked only when finding training) */
  homePoint: HomePoint | null;
  setHome: (home: HomePoint | null) => void;
  /** How far the user will drive to an in-person short course, 10–100 miles (asked when none was found within 10) */
  courseMaxMiles: number;
  setCourseMaxMiles: (miles: number) => void;
  setLocation: (loc: {
    stateAbbr: string;
    stateName: string;
    isMetro: boolean;
    metroName?: string;
    label: string;
  }) => void;

  // Selected opportunities (stored as IDs)
  selectedOpportunities: string[];
  toggleOpportunity: (id: string) => void;

  // The user's plan: per opportunity, added to the plan or not pursuing
  planDecisions: Record<string, PlanDecision>;
  planMeta: Record<string, PlanMeta>;
  setPlanMeta: (id: string, patch: Partial<PlanMeta>) => void;
  /** null clears the decision */
  setPlanDecision: (id: string, decision: PlanDecision | null) => void;

  /**
   * Answers to "Do you have this?" for mandatory credentials (onboarding screen
   * Credentials, and "I already have this" on a plan item): name → true (has it)
   * / false (doesn't). Not in the map = not asked yet. Saved to user_profiles.credentials.
   */
  credentials: Record<string, boolean>;
  /** null removes the answer */
  setCredentialAnswer: (name: string, has: boolean | null) => void;

  /** Health insurance through the job (lib/healthInsurance); null = not asked yet */
  healthCoverage: HealthCoverage | null;
  /** null removes the answer */
  setHealthCoverage: (c: Omit<HealthCoverage, 'answeredAt'> | null) => void;

  /** Union membership (asked in the union action and Profile); null = not asked yet */
  unionMembership: UnionMembership | null;
  /** null removes the answer */
  setUnionMembership: (m: Omit<UnionMembership, 'answeredAt'> | null) => void;

  // Job offer opt-in
  wantsJobOffers: boolean | null;
  setWantsJobOffers: (v: boolean) => void;

  // Rise track: target career role
  targetCareerRole: string | null;    // BLS occupation title, e.g. "First-Line Supervisors of Retail Sales Workers"
  targetCareerTitle: string | null;   // Short display title, e.g. "Retail Supervisor"
  targetCareerWage: number | null;    // Annual median wage from BLS
  /** Set when the user picked the next role themselves (BLS SOC); the AI suggestion then doesn't overwrite it */
  targetCareerSoc: string | null;
  /** Certifications recommended for the next role (skills screen) */
  targetCareerCerts: string[];
  setTargetCareerCerts: (certs: string[]) => void;
  /** BLS median pay for the next role where the user lives */
  targetCareerPay: { median: number; source: string; area: string; soc?: string } | null;
  setTargetCareerPay: (pay: { median: number; source: string; area: string; soc?: string } | null) => void;
  setTargetCareer: (role: string, title: string, wage: number, soc?: string | null) => void;

  // Rise track: skills the user has marked as "I have this" in SkillsCerts
  markedSkills: string[];
  setMarkedSkills: (skills: string[]) => void;
  toggleMarkedSkill: (skill: string) => void;

  // Work schedule used by the minimum-wage check (null = state defaults)
  workSchedule: WorkSchedule | null;
  setWorkSchedule: (s: WorkSchedule | null) => void;

  /**
   * Claim my rights answers (lib/rightsFacts). Sensitive (employer problems,
   * retaliation), so saved to their own table worker_rights_answers, which
   * only the user can read — not to user_profiles.
   */
  rightsFacts: RightsFacts;
  /** Merge answers in; undefined values remove an answer */
  setRightsFacts: (patch: Partial<RightsFacts>) => void;

  /** Restore saved data (e.g. after sign-in) without writing it back */
  hydrateFromProfileRow: (row: Record<string, any>) => void;

  // Reset
  reset: () => void;
}

/** Plan item id prefixes of which only one item can be in the plan (data/careerMoves) */
const EXCLUSIVE_PREFIXES = ['move:promotion:', 'move:change:'];

// Bumped on every reset / hydrate, so a slow lookup started for one user can't
// land in the store after another user has signed in.
let generation = 0;

const initialState = {
  goals: [] as UserGoal[],
  focusGoal: null as Goal | null,
  profile: {},
  environmentConcerns: [],
  physicalConcerns: [],
  primaryConcern: null,
  earningsPercentile: null,
  matchedOccupation: null,
  locationState: null,
  locationStateName: null,
  locationIsMetro: null,
  locationMetro: null,
  locationLabel: null,
  homePoint: null as HomePoint | null,
  courseMaxMiles: 10,
  selectedOpportunities: [],
  planDecisions: {} as Record<string, PlanDecision>,
  planMeta: {} as Record<string, PlanMeta>,
  credentials: {} as Record<string, boolean>,
  healthCoverage: null as HealthCoverage | null,
  unionMembership: null as UnionMembership | null,
  wantsJobOffers: null,
  targetCareerRole: null,
  targetCareerTitle: null,
  targetCareerWage: null,
  targetCareerSoc: null,
  targetCareerCerts: [] as string[],
  targetCareerPay: null as { median: number; source: string; area: string; soc?: string } | null,
  markedSkills: [],
  workSchedule: null,
  rightsFacts: {} as RightsFacts,
};

export const useUserStore = create<UserState>((set, get) => ({
  ...initialState,

  setFocusGoal: (focus) => {
    const goals = withFocus(get().goals, focus);
    set({ goals, focusGoal: focus });
    // `goal` and `satisfaction` columns keep the focus goal for older readers
    queueProfileSave({ goals, goal: focus, satisfaction: goals[0].satisfaction ?? null }, true);
  },
  setOtherGoals: (ids) => {
    const current = goalsByImportance(get().goals);
    const focus = get().focusGoal ?? current[0]?.id;
    if (!focus) return;
    const kept = current.filter((g) => g.id === focus || ids.includes(g.id));
    const added: UserGoal[] = ids
      .filter((id) => id !== focus && !kept.some((g) => g.id === id))
      .map((id) => ({ id, importance: 0, addedAt: new Date().toISOString() }));
    const goals = [...kept, ...added].map((g, i) => ({ ...g, importance: i + 1 }));
    set({ goals });
    queueProfileSave({ goals });
  },
  setGoalSatisfaction: (id, satisfaction) => {
    const goals = get().goals.map((g) => (g.id === id ? { ...g, satisfaction } : g));
    set({ goals });
    queueProfileSave({ goals, ...(id === get().focusGoal && { satisfaction }) });
  },
  // Whenever the role changes, re-match it to a BLS occupation so every
  // benchmark (wages, union premium) is occupation-specific when possible.
  setProfile: (p) => {
    set((s) => {
      const profile = { ...s.profile, ...p };
      if (p.role !== undefined && p.role !== s.profile.role) {
        return { profile, matchedOccupation: matchOccupation(profile.role ?? '') };
      }
      return { profile };
    });
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      const col = PROFILE_COLUMNS[k as keyof UserProfile];
      if (col) row[col] = v ?? null;
    }
    if (Object.keys(row).length) queueProfileSave(row);
  },
  setEnvironmentConcerns: (environmentConcerns) => set({ environmentConcerns }),
  setPhysicalConcerns: (physicalConcerns) => set({ physicalConcerns }),
  setPrimaryConcern: (primaryConcern) => set({ primaryConcern }),
  setEarningsPercentile: (earningsPercentile) => set({ earningsPercentile }),
  setMatchedOccupation: (matchedOccupation) => {
    const s = get();
    const role = (s.profile.role ?? '').trim().toLowerCase();
    // Keep the role as specific as we know it: replace it with the occupation
    // title when it's empty, a "line of work" chip (e.g. "Hospitality"), or the
    // previously picked occupation's title. A title the user typed is kept.
    const coarse = !role
      || Object.keys(CATEGORY_OCCUPATIONS).some((c) => c.toLowerCase() === role)
      || (!!s.matchedOccupation && s.matchedOccupation.title.toLowerCase() === role);
    if (matchedOccupation && coarse) {
      // Set directly (not via setProfile) so the role change doesn't re-match
      set({ matchedOccupation, profile: { ...s.profile, role: matchedOccupation.title } });
      queueProfileSave({ occupation_soc: matchedOccupation.soc, role: matchedOccupation.title });
    } else {
      set({ matchedOccupation });
      queueProfileSave({ occupation_soc: matchedOccupation?.soc ?? null });
    }
  },
  setLocation: (loc) => {
    // A ZIP from another state no longer fits — forget it
    const s0 = get();
    if (s0.homePoint && s0.locationState && s0.locationState !== loc.stateAbbr) {
      set({ homePoint: null });
      saveHome(null);
    }
    set({
      locationState: loc.stateAbbr,
      locationStateName: loc.stateName,
      locationIsMetro: loc.isMetro,
      locationMetro: loc.metroName ?? null,
      locationLabel: loc.label,
    });
    // Saved straight away — no waiting for the end of onboarding
    queueProfileSave({
      location: loc.label,
      location_state: loc.stateAbbr,
      location_state_name: loc.stateName,
      location_is_metro: loc.isMetro,
      location_metro: loc.metroName ?? null,
    }, true);
  },
  setHome: (homePoint) => { set({ homePoint }); saveHome(homePoint); },
  setCourseMaxMiles: (miles) => {
    const courseMaxMiles = Math.round(Math.min(100, Math.max(10, miles)));
    set({ courseMaxMiles });
    saveCourseMaxMiles(courseMaxMiles);
  },
  toggleOpportunity: (id) =>
    set((s) => ({
      selectedOpportunities: s.selectedOpportunities.includes(id)
        ? s.selectedOpportunities.filter((x) => x !== id)
        : [...s.selectedOpportunities, id],
    })),
  setPlanDecision: (id, decision) => {
    const next = { ...get().planDecisions };
    // One promotion and one career change at a time: keeping one replaces the other
    const prefix = EXCLUSIVE_PREFIXES.find((p) => id.startsWith(p));
    if (prefix && decision === 'in_plan') {
      for (const k of Object.keys(next)) if (k !== id && k.startsWith(prefix) && next[k] === 'in_plan') delete next[k];
    }
    if (decision) next[id] = decision; else delete next[id];
    set({ planDecisions: next });
    savePlan(next);
    get().setPlanMeta(id, { decidedAt: new Date().toISOString() });
  },
  setPlanMeta: (id, patch) => {
    const all = { ...get().planMeta, [id]: { ...get().planMeta[id], ...patch } };
    set({ planMeta: all });
    savePlanMeta(all);
  },
  setCredentialAnswer: (name, has) => {
    const next = { ...get().credentials };
    if (has === null) delete next[name]; else next[name] = has;
    set({ credentials: next });
    saveCredentials(next);
  },
  setHealthCoverage: (c) => {
    const healthCoverage = c ? { ...c, answeredAt: new Date().toISOString() } : null;
    set({ healthCoverage });
    saveHealthCoverage(healthCoverage);
  },
  setUnionMembership: (m) => {
    const unionMembership = m ? { ...m, answeredAt: new Date().toISOString() } : null;
    set({ unionMembership });
    saveUnionMembership(unionMembership);
  },
  setWantsJobOffers: (wantsJobOffers) => {
    set({ wantsJobOffers });
    queueProfileSave({ wants_job_offers: wantsJobOffers });
  },
  setTargetCareerCerts: (targetCareerCerts) => set({ targetCareerCerts }),
  setTargetCareerPay: (targetCareerPay) => set({ targetCareerPay }),
  setTargetCareer: (targetCareerRole, targetCareerTitle, targetCareerWage, soc) =>
    set((s) => ({
      targetCareerRole, targetCareerTitle, targetCareerWage, targetCareerSoc: soc ?? null,
      // A different next role has different certifications and pay
      ...(s.targetCareerTitle !== targetCareerTitle && { targetCareerCerts: [], targetCareerPay: null }),
    })),
  setMarkedSkills: (markedSkills) => set({ markedSkills }),
  setWorkSchedule: (workSchedule) => {
    set({ workSchedule });
    queueProfileSave({ work_schedule: workSchedule });
  },
  setRightsFacts: (patch) => {
    const merged: RightsFacts = { ...get().rightsFacts, ...patch };
    (Object.keys(merged) as Array<keyof RightsFacts>).forEach((k) => merged[k] === undefined && delete merged[k]);
    set({ rightsFacts: merged });
    saveRightsAnswers(merged);
  },
  toggleMarkedSkill: (skill) =>
    set((s) => ({
      markedSkills: s.markedSkills.includes(skill)
        ? s.markedSkills.filter((x) => x !== skill)
        : [...s.markedSkills, skill],
    })),
  hydrateFromProfileRow: (row) => {
    // Occupations beyond the bundled list are looked up in the catalogue
    const gen = ++generation;
    // Claim my rights answers live in their own table
    if (row.id) {
      loadRightsAnswers(row.id).then((answers) => {
        if (answers && gen === generation) set({ rightsFacts: answers as RightsFacts });
      });
    }
    if (row.occupation_soc && !occupationBySoc(row.occupation_soc)) {
      fetchOccupationBySoc(row.occupation_soc).then((occ) => {
        if (occ && gen === generation) set({ matchedOccupation: occ });
      });
    }
    set((s) => {
    const profile: UserProfile = {
      ...s.profile,
      ...(row.role != null && { role: row.role }),
      ...(row.years_experience != null && { yearsExperience: row.years_experience }),
      ...(row.tenure_months != null && { tenureMonths: row.tenure_months }),
      ...(row.annual_earnings != null && { annualEarnings: row.annual_earnings }),
      ...(row.employer != null && { employer: row.employer }),
      ...(row.skills != null && { skills: row.skills }),
      ...(row.hourly_rate != null && { hourlyRate: Number(row.hourly_rate) }),
    };
    return {
      profile,
      // A saved explicit choice wins; otherwise re-match from the role text
      matchedOccupation: occupationBySoc(row.occupation_soc)
        ?? (profile.role ? matchOccupation(profile.role) : s.matchedOccupation),
      ...(() => {
        const goals = goalsFromRow(row);
        return goals ? { goals, focusGoal: goals[0].id } : {};
      })(),
      wantsJobOffers: row.wants_job_offers ?? s.wantsJobOffers,
      ...(row.opportunity_plan && typeof row.opportunity_plan === 'object' && { planDecisions: row.opportunity_plan }),
      ...(row.opportunity_meta && typeof row.opportunity_meta === 'object' && { planMeta: row.opportunity_meta }),
      ...(row.credentials && typeof row.credentials === 'object' && { credentials: row.credentials }),
      ...(row.health_coverage && typeof row.health_coverage === 'object' && ['yes', 'no', 'unsure'].includes(row.health_coverage.has)
        && { healthCoverage: row.health_coverage as HealthCoverage }),
      ...(row.union_membership && typeof row.union_membership === 'object' && ['member', 'other', 'no', 'unsure'].includes(row.union_membership.status)
        && { unionMembership: row.union_membership as UnionMembership }),
      ...(row.location_state && {
        locationState: row.location_state,
        locationStateName: row.location_state_name ?? null,
        locationIsMetro: row.location_is_metro ?? null,
        locationMetro: row.location_metro ?? null,
        locationLabel: row.location ?? null,
      }),
      ...(row.work_schedule && { workSchedule: row.work_schedule }),
      ...(row.course_max_miles != null && { courseMaxMiles: Number(row.course_max_miles) }),
      ...(row.home_zip && row.home_lat != null && row.home_lon != null && {
        homePoint: {
          zip: row.home_zip, lat: Number(row.home_lat), lon: Number(row.home_lon),
          city: String(row.home_city ?? '').split(',')[0].trim(),
          state: String(row.home_city ?? '').split(',')[1]?.trim() ?? '',
          cityMiles: 0,
        },
      }),
    };
    });
  },
  reset: () => { generation++; set(initialState); },
}));
