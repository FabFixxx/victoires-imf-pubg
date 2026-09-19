import { useMemo } from 'react';
import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import type { ColorScheme } from '../constants/colors';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.text}>Page introuvable</Text>
        <Link href="/" style={styles.link}>
          Retour à l'accueil
        </Link>
      </View>
    </>
  );
}

function getStyles(colors: ColorScheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    text: {
      fontSize: 18,
      color: colors.textSecondary,
    },
    link: {
      fontSize: 15,
      color: colors.primary,
      fontWeight: '700',
    },
  });
}
