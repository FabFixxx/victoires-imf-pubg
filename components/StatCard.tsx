import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import type { ColorScheme } from '../constants/colors';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  accent?: boolean;
  large?: boolean;
}

export function StatCard({ label, value, subValue, accent, large }: StatCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={[styles.card, accent && styles.cardAccent]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, large && styles.valueLarge, accent && styles.valueAccent]}>
        {value}
      </Text>
      {subValue ? <Text style={styles.subValue}>{subValue}</Text> : null}
    </View>
  );
}

function getStyles(colors: ColorScheme) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      minHeight: 90,
      justifyContent: 'center',
    },
    cardAccent: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    label: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.5,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    value: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 0.5,
    },
    valueLarge: {
      fontSize: 32,
    },
    valueAccent: {
      color: colors.primary,
    },
    subValue: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
  });
}
