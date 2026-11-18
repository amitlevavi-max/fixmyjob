import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts, Radii } from '../theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  /** Leading icon, e.g. "f:mail" */
  icon?: string;
  /** Element rendered at the right edge inside the field (e.g. show/hide toggle) */
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  large?: boolean;
}

export default function TextField({
  label,
  icon,
  right,
  containerStyle,
  large,
  multiline,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          multiline && styles.fieldMulti,
          focused && styles.fieldFocused,
        ]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={18}
            color={focused ? Colors.accentHi : Colors.slate}
            style={multiline ? { marginTop: 2 } : undefined}
          />
        ) : null}
        <TextInput
          placeholderTextColor={Colors.faint}
          style={[styles.input, large && styles.inputLarge, multiline && styles.inputMulti, style]}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.slate,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.field,
  },
  fieldMulti: {
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  fieldFocused: {
    borderColor: Colors.accent,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.text,
    paddingVertical: 12,
  },
  inputLarge: {
    fontSize: 19,
    fontFamily: Fonts.semiBold,
  },
  inputMulti: {
    minHeight: 150,
    paddingVertical: 0,
    lineHeight: 21,
  },
});
