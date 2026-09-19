import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ColorScheme } from '../constants/colors';

export type ThemeMode = 'system' | 'dark' | 'light';
const STORAGE_KEY = '@imf_theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: 'dark' | 'light';
  colors: ColorScheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  resolvedMode: 'dark',
  colors: darkColors,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Le thème sombre existant reste le choix par défaut tant que l'utilisateur
  // n'a rien choisi explicitement dans Réglages (contrairement à seedbox-manager
  // qui démarre sur "système").
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const systemScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const resolvedMode: 'dark' | 'light' = mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;
  const colors = useMemo(() => (resolvedMode === 'dark' ? darkColors : lightColors), [resolvedMode]);

  return <ThemeContext.Provider value={{ mode, resolvedMode, colors, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
