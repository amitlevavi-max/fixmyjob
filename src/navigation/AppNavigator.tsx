import React from 'react';
import { NavigationContainer, NavigatorScreenParams, useNavigationContainerRef } from '@react-navigation/native';
import type { Session } from '@supabase/supabase-js';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
// ── Welcome screen: swap these two lines to switch between designs ──────────
// import WelcomeScreen from '../screens/Welcome';        // v1 (purple gradient)
import WelcomeScreen from '../screens/WelcomeV2'; // v2 (dark navy + orange)
// ────────────────────────────────────────────────────────────────────────────
import SignUpScreen from '../screens/auth/SignUp';
import SignInScreen from '../screens/auth/SignIn';
import GoalPickerScreen from '../screens/GoalPicker';
import type { Goal } from '../store/userStore';
import JobSatisfactionScreen from '../screens/JobSatisfaction';
import ImportMethodScreen from '../screens/ImportMethod';
import CVUploadScreen from '../screens/CVUpload';
import LinkedInPasteScreen from '../screens/LinkedInPaste';
import ManualEntryScreen from '../screens/ManualEntry';
import DataReviewScreen from '../screens/DataReview';
import CalculatingScreen from '../screens/Calculating';
import CredentialsScreen from '../screens/Credentials';
import RightsQuestionsScreen from '../screens/RightsQuestions';
import RightsAnswersScreen from '../screens/RightsAnswers';
import HealthCoverageScreen from '../screens/HealthCoverage';
import UnionMembershipScreen from '../screens/UnionMembership';
// Main tabs: Profile · Where I stand · My plan
import MainTabs, { TabParamList } from './MainTabs';
import { lw } from '../i18n/withLanguage';
// Rise Up track
import TimeToNextLevelScreen from '../screens/rise/TimeToNextLevel';
import SkillsCertsScreen from '../screens/rise/SkillsCerts';
import NextLevelPayScreen from '../screens/rise/NextLevelPay';
// Claim Rights track
import RightsHubScreen from '../screens/rights/RightsHub';
import RightsDetailScreen from '../screens/rights/RightsDetail';
// Less Physical track
import EnvironmentFactorsScreen from '../screens/physical/EnvironmentFactors';
import PhysicalActivitiesScreen from '../screens/physical/PhysicalActivities';
import PrimaryConcernScreen from '../screens/physical/PrimaryConcern';
// Phase 4 & 5
import InsightsSummaryScreen from '../screens/InsightsSummary';
import NextStepsScreen from '../screens/NextSteps';
import AdviceFeedbackScreen from '../screens/AdviceFeedback';
import JobOfferOptInScreen from '../screens/JobOfferOptIn';
import ShareScreen from '../screens/Share';
import AllSuggestionsScreen from '../screens/AllSuggestions';
import DataSourcesScreen from '../screens/DataSources';
import SupportScreen from '../screens/Support';
import { trackScreen } from '../lib/analytics';

export type RootStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  SignIn: undefined;
  /** edit: change the main goal · others: tick the user's other goals */
  GoalPicker: { edit?: boolean; others?: boolean } | undefined;
  JobSatisfaction: { edit?: boolean } | undefined;
  ImportMethod: undefined;
  CVUpload: undefined;
  LinkedInPaste: undefined;
  /** edit = change one answer from Profile and come back */
  /** resume: back from the Credentials screen → continue with the tenure question */
  ManualEntry: { edit?: 'job' | 'tenure' | 'pay' | 'employer'; resume?: 'tenure' } | undefined;
  DataReview: undefined;
  /** Mandatory credentials of the user's job; edit = from Profile */
  /** edit: from Profile · afterJob: onboarding, asked right after the job question (returns to ManualEntry) */
  Credentials: { edit?: boolean; afterJob?: boolean } | undefined;
  /** Claim my rights onboarding questions (edit = from Profile) */
  RightsQuestions: { edit?: boolean } | undefined;
  /** Profile → every Claim my rights question and answer, editable */
  RightsAnswers: undefined;
  /** Profile → health insurance through the job (lib/healthInsurance) */
  HealthCoverage: undefined;
  /** Profile → union membership (lib/unionMembership) */
  UnionMembership: undefined;
  Calculating: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  TimeToNextLevel: undefined;
  SkillsCerts: undefined;
  NextLevelPay: undefined;
  RightsHub: undefined;
  RightsDetail: { categoryId: string };
  EnvironmentFactors: { edit?: boolean } | undefined;
  PhysicalActivities: { edit?: boolean } | undefined;
  PrimaryConcern: { edit?: boolean } | undefined;
  InsightsSummary: undefined;
  /** goal: the goal it was opened under — the title is worded for it */
  NextSteps: { opportunityId: string; goal?: Goal };
  AdviceFeedback: { opportunityId: string; opportunityTitle: string };
  JobOfferOptIn: { edit?: boolean } | undefined;
  Share: undefined;
  AllSuggestions: undefined;
  DataSources: undefined;
  Support: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/** Navigation state the app opens with (see startStateFor). */
export type StartState = { index: number; routes: { name: keyof RootStackParamList; params?: any }[] };

/**
 * Where the app opens on launch. Signed out → Welcome. Still signed in from a
 * previous launch → same rule as signing in on Welcome: no goal yet → goal
 * question, no job or pay yet → job questions, otherwise Where I stand.
 * Unfinished onboarding keeps Welcome underneath so "back" still works.
 * `row` is the saved user_profiles row; null (none saved, or it failed to
 * load) → Welcome, as before.
 */
export function startStateFor(session: Session | null, row: Record<string, any> | null): StartState {
  // No saved profile (or it couldn't be loaded, e.g. offline) → Welcome as before
  if (!session || !row) return { index: 0, routes: [{ name: 'Welcome' }] };
  if (row.goal && row.role && row.annual_earnings) {
    return { index: 0, routes: [{ name: 'Main', params: { screen: 'Standing' } }] };
  }
  const next = !row.goal ? 'GoalPicker' : 'ManualEntry';
  return { index: 1, routes: [{ name: 'Welcome' }, { name: next }] };
}

/**
 * Screens that report their own screen views to analytics because one route
 * holds several questions (ManualEntry: job · closest job · time in job · pay).
 */
const SELF_TRACKED_SCREENS = new Set(['ManualEntry']);

export default function AppNavigator({ initialState }: { initialState?: StartState }) {
  const navRef = useNavigationContainerRef<RootStackParamList>();

  // Analytics: one screen view per screen change (tabs included, e.g. "Standing")
  function onScreenChange() {
    const name = navRef.getCurrentRoute()?.name;
    if (name && !SELF_TRACKED_SCREENS.has(name)) trackScreen(name);
  }

  return (
    <NavigationContainer
      ref={navRef}
      initialState={initialState as any}
      onReady={onScreenChange}
      onStateChange={onScreenChange}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#112040' },
          animationEnabled: true,
        }}
      >
        <Stack.Screen name="Welcome" component={lw(WelcomeScreen)} />
        <Stack.Screen name="SignUp" component={lw(SignUpScreen)} />
        <Stack.Screen name="SignIn" component={lw(SignInScreen)} />
        <Stack.Screen name="GoalPicker" component={lw(GoalPickerScreen)} />
        <Stack.Screen name="JobSatisfaction" component={lw(JobSatisfactionScreen)} />
        <Stack.Screen name="ImportMethod" component={lw(ImportMethodScreen)} />
        <Stack.Screen name="CVUpload" component={lw(CVUploadScreen)} />
        <Stack.Screen name="LinkedInPaste" component={lw(LinkedInPasteScreen)} />
        <Stack.Screen name="ManualEntry" component={lw(ManualEntryScreen)} />
        <Stack.Screen name="DataReview" component={lw(DataReviewScreen)} />
        <Stack.Screen name="Credentials" component={lw(CredentialsScreen)} />
        <Stack.Screen name="RightsQuestions" component={lw(RightsQuestionsScreen)} />
        <Stack.Screen name="RightsAnswers" component={lw(RightsAnswersScreen)} />
        <Stack.Screen name="HealthCoverage" component={lw(HealthCoverageScreen)} />
        <Stack.Screen name="UnionMembership" component={lw(UnionMembershipScreen)} />
        <Stack.Screen name="Calculating" component={lw(CalculatingScreen)} />
        <Stack.Screen name="Main" component={lw(MainTabs)} />
        <Stack.Screen name="TimeToNextLevel" component={lw(TimeToNextLevelScreen)} />
        <Stack.Screen name="SkillsCerts" component={lw(SkillsCertsScreen)} />
        <Stack.Screen name="NextLevelPay" component={lw(NextLevelPayScreen)} />
        <Stack.Screen name="RightsHub" component={lw(RightsHubScreen)} />
        <Stack.Screen name="RightsDetail" component={lw(RightsDetailScreen)} />
        <Stack.Screen name="EnvironmentFactors" component={lw(EnvironmentFactorsScreen)} />
        <Stack.Screen name="PhysicalActivities" component={lw(PhysicalActivitiesScreen)} />
        <Stack.Screen name="PrimaryConcern" component={lw(PrimaryConcernScreen)} />
        <Stack.Screen name="InsightsSummary" component={lw(InsightsSummaryScreen)} />
        <Stack.Screen name="NextSteps" component={lw(NextStepsScreen)} />
        <Stack.Screen name="AdviceFeedback" component={lw(AdviceFeedbackScreen)} />
        <Stack.Screen name="JobOfferOptIn" component={lw(JobOfferOptInScreen)} />
        <Stack.Screen name="Share" component={lw(ShareScreen)} />
        <Stack.Screen name="AllSuggestions" component={lw(AllSuggestionsScreen)} />
        <Stack.Screen name="DataSources" component={lw(DataSourcesScreen)} />
        <Stack.Screen name="Support" component={lw(SupportScreen)} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
