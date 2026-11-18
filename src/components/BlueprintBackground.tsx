import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Path, Rect, RadialGradient, Stop } from 'react-native-svg';
import { Colors } from '../theme';

interface Props {
  /** Adds a faint safety-orange glow in the top-right corner */
  glow?: boolean;
  /** Kept for compatibility — no longer drawn (registration marks read as construction-only) */
  cornerMarks?: boolean;
  /** Faint technical grid. Off by default since the Oct 2026 refresh. */
  grid?: boolean;
}

const MINOR = 22;
const MAJOR = MINOR * 5;

/**
 * Deep-denim gradient with a technical-drawing grid on top.
 * Rendered absolutely behind every screen (see <Screen />).
 *
 * The grid is drawn as two plain paths (no SVG <Pattern>) — nested patterns
 * are very slow on Android and can freeze touch handling.
 */
export default function BlueprintBackground({ glow = true, grid = false }: Props) {
  const { width, height } = useWindowDimensions();

  const [minorD, majorD] = useMemo(() => {
    let minor = '';
    let major = '';
    for (let x = 0; x <= width; x += MINOR) {
      const seg = `M${x} 0V${height}`;
      if (x % MAJOR === 0) major += seg; else minor += seg;
    }
    for (let y = 0; y <= height; y += MINOR) {
      const seg = `M0 ${y}H${width}`;
      if (y % MAJOR === 0) major += seg; else minor += seg;
    }
    return [minor, major];
  }, [width, height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[Colors.ink, Colors.denimDark, '#152A57']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {glow && (
          <Defs>
            <RadialGradient id="glow" cx="100%" cy="0%" r="70%">
              <Stop offset="0%" stopColor={Colors.accent} stopOpacity="0.16" />
              <Stop offset="100%" stopColor={Colors.accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>
        )}
        {grid && <Path d={minorD} stroke={Colors.grid} strokeWidth={1} />}
        {grid && <Path d={majorD} stroke={Colors.gridMajor} strokeWidth={1} />}
        {glow && <Rect width={width} height={height} fill="url(#glow)" />}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: Colors.lineStrong,
  },
});
