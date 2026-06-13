import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  accent?: boolean;
  large?: boolean;
}

export function StatCard({ label, value, subValue, accent, large }: StatCardProps) {
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

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    minHeight: 90,
    justifyContent: 'center',
  },
  cardAccent: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
  },
  valueLarge: {
    fontSize: 32,
  },
  valueAccent: {
    color: Colors.primary,
  },
  subValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
