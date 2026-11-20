import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent, Text } from 'react-native';
import { Colors, Fonts } from '../theme';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Called once when the user first touches the slider */
  onTouched?: () => void;
  /** Called when the finger lifts, with the value before and after the drag (analytics) */
  onRelease?: (from: number, to: number) => void;
  /** Small labels under the ends of the track */
  minLabel?: string;
  maxLabel?: string;
}

const THUMB = 30;

/**
 * Horizontal slider in plain React Native (no native module, so no app
 * rebuild needed). Tap anywhere on the track or drag the thumb.
 */
export default function Slider({ value, min, max, step = 1, onChange, onTouched, onRelease, minLabel, maxLabel }: SliderProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const startX = useRef(0);
  const touched = useRef(false);
  const dragFrom = useRef(value);
  const props = useRef({ value, min, max, step, onChange, onTouched, onRelease });
  props.current = { value, min, max, step, onChange, onTouched, onRelease };

  const toValue = (x: number) => {
    const { min: lo, max: hi, step: st } = props.current;
    const w = Math.max(1, widthRef.current - THUMB);
    const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / w));
    const raw = lo + ratio * (hi - lo);
    return Math.min(hi, Math.max(lo, Math.round(raw / st) * st));
  };
  const emit = (x: number) => {
    if (!touched.current) { touched.current = true; props.current.onTouched?.(); }
    props.current.onChange(toValue(x));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,   // don't let the ScrollView steal the drag
      onPanResponderGrant: (e) => { dragFrom.current = props.current.value; startX.current = e.nativeEvent.locationX; emit(startX.current); },
      onPanResponderMove: (_e, g) => emit(startX.current + g.dx),
      onPanResponderRelease: (_e, g) => props.current.onRelease?.(dragFrom.current, toValue(startX.current + g.dx)),
    }),
  ).current;

  const ratio = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const left = ratio * Math.max(0, width - THUMB);

  return (
    <View>
      <View
        style={styles.hit}
        onLayout={(e: LayoutChangeEvent) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); }}
        {...responder.panHandlers}
      >
        <View style={styles.track} pointerEvents="none" />
        <View style={[styles.fill, { width: left }]} pointerEvents="none" />
        <View style={[styles.thumb, { left }]} pointerEvents="none" />
      </View>
      {minLabel || maxLabel ? (
        <View style={styles.labels}>
          <Text style={styles.label}>{minLabel ?? ''}</Text>
          <Text style={styles.label}>{maxLabel ?? ''}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 44, justifyContent: 'center' },
  track: {
    position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3,
    backgroundColor: Colors.lineStrong,
  },
  fill: { position: 'absolute', left: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    backgroundColor: '#fff', borderWidth: 4, borderColor: Colors.accent,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  label: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.slate },
});
