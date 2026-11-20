/**
 * The three main tabs, always visible after onboarding:
 *   Profile — every answer the user gave, viewable and editable
 *   Where I stand — the pay comparison and the path to the user's goal
 *   My plan — the opportunities they chose
 * Detail screens (an opportunity, editing an answer…) open on top of the tabs
 * from the root stack, so Back returns to the tab they came from.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { Colors, Fonts } from '../theme';
import ProfileScreen from '../screens/Profile';
import StandingScreen from '../screens/Standing';
import MyPlanScreen from '../screens/MyPlan';
import { lw } from '../i18n/withLanguage';
import { useT } from '../i18n';
import { track } from '../lib/analytics';

/** Tab names in analytics reports */
const TAB_EVENT_NAMES: Record<keyof TabParamList, string> = {
  Profile: 'profile',
  Standing: 'where_i_stand',
  Plan: 'my_plan',
};

export type TabParamList = {
  Profile: { saved?: string } | undefined;
  Standing: undefined;
  Plan: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, string> = {
  Profile: 'f:user',
  Standing: 'f:bar-chart-2',
  Plan: 'f:check-square',
};

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <Tab.Navigator
      initialRouteName="Standing"
      // Analytics: a tap on a bottom tab (event.screen = the screen the user was on)
      screenListeners={({ route }) => ({
        tabPress: () => track('tab_click', { tab: TAB_EVENT_NAMES[route.name as keyof TabParamList] }),
      })}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.accentHi,
        tabBarInactiveTintColor: Colors.slate,
        tabBarStyle: {
          backgroundColor: Colors.ink,
          borderTopColor: Colors.line,
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 12, fontFamily: Fonts.semiBold },
        tabBarIcon: ({ color, size }) => <Icon name={ICONS[route.name]} size={size - 2} color={color} />,
        sceneContainerStyle: { backgroundColor: Colors.ink },
      })}
    >
      <Tab.Screen name="Profile" component={lw(ProfileScreen)} options={{ title: t('Profile') }} />
      <Tab.Screen name="Standing" component={lw(StandingScreen)} options={{ title: t('Where I stand') }} />
      <Tab.Screen name="Plan" component={lw(MyPlanScreen)} options={{ title: t('My plan') }} />
    </Tab.Navigator>
  );
}
