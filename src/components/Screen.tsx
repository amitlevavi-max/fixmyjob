import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BlueprintBackground from './BlueprintBackground';
import { Colors, Spacing } from '../theme';

interface ScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  scrollable?: boolean;
  padded?: boolean;
  /** Pinned to the bottom (outside the scroll view) — use for primary CTAs */
  footer?: React.ReactNode;
  /** Pass-through to the background */
  glow?: boolean;
  cornerMarks?: boolean;
  /** To scroll the page from the screen (e.g. "Let's get there" → a card) */
  scrollRef?: React.RefObject<ScrollView | null>;
  /** Height of the visible scroll area (between the top and the footer) */
  onViewportHeight?: (h: number) => void;
}

export default function Screen({
  children,
  style,
  scrollable = true,
  padded = true,
  footer,
  glow = true,
  cornerMarks = false,
  scrollRef,
  onViewportHeight,
}: ScreenProps) {
  const content = (
    <View style={[styles.inner, padded && styles.padded, style]}>
      {children}
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.ink} />
      <BlueprintBackground glow={glow} cornerMarks={cornerMarks} />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {scrollable ? (
            <ScrollView
              ref={scrollRef}
              onLayout={onViewportHeight ? (e) => onViewportHeight(e.nativeEvent.layout.height) : undefined}
              style={styles.flex}
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {content}
            </ScrollView>
          ) : (
            content
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.denimDark,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: 12,
    paddingBottom: 28,
  },
  footer: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    backgroundColor: 'rgba(10,22,40,0.85)',
    gap: 4,
  },
});
