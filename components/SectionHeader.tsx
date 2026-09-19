import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import type { ColorScheme } from '../constants/colors';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.line} />
        <Text style={styles.title}>{title}</Text>
        <View style={styles.line} />
      </View>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

function getStyles(colors: ColorScheme) {
  return StyleSheet.create({
    wrapper: { marginVertical: 16 },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: colors.cardBorder,
    },
    title: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2.5,
      color: colors.primary,
      textTransform: 'uppercase',
    },
    subtitle: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
  });
}
