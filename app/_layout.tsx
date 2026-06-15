import 'react-native-url-polyfill/auto';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { getCurrentPlayer, setCurrentPlayer, getLastSync, setLastSync } from '../lib/storage';
import { GROUP_PLAYERS } from '../constants/players';
import { registerPushToken, scheduleSundayReminder } from '../lib/notifications';
import { syncData } from '../lib/pubg-api';
import { checkForUpdate } from '../lib/update-check';
import { registerWebPush } from '../lib/web-push-client';

type InitState = 'loading' | 'select' | 'ready';

export default function RootLayout() {
  const [initState, setInitState] = useState<InitState>('loading');
  const [currentPlayer, setPlayer] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setInitState('select'), 3000);
    (async () => {
      try {
        const player = await getCurrentPlayer();
        clearTimeout(timeout);
        if (!player) {
          setInitState('select');
        } else {
          setPlayer(player);
          setInitState('ready');
          scheduleSundayReminder();
          registerWebPush(player);
          triggerAutoSync();
          checkForUpdate().then((info) => {
            if (!info) return;
            Alert.alert(
              '🆕 Mise à jour disponible',
              `La version ${info.version} est disponible.\n\nTu peux continuer à utiliser l'app ou installer la mise à jour maintenant.`,
              [
                { text: 'Plus tard', style: 'cancel' },
                {
                  text: 'Mettre à jour',
                  onPress: () => Linking.openURL(info.downloadUrl),
                },
              ]
            );
          });
        }
      } catch {
        clearTimeout(timeout);
        setInitState('select');
      }
    })();
    return () => clearTimeout(timeout);
  }, []);

  const triggerAutoSync = async () => {
    const last = await getLastSync();
    if (last && Date.now() - last.getTime() < 24 * 60 * 60 * 1000) return;
    setSyncing(true);
    try {
      await syncData();
      await setLastSync(new Date());
    } catch {
      // Silent fail — user can manually retry
    }
    setSyncing(false);
  };

  const handleSelectPlayer = async (name: string) => {
    await setCurrentPlayer(name);
    setPlayer(name);
    setInitState('ready');
    registerPushToken(name).then(() => scheduleSundayReminder());
    registerWebPush(name);
    triggerAutoSync();
  };

  if (initState === 'loading') {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <Text style={styles.appName}>VICTOIRES IMF</Text>
        <Text style={styles.appNameAccent}>PUBG</Text>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (initState === 'select') {
    return (
      <SafeAreaView style={styles.selectContainer}>
        <StatusBar style="light" />
        <View style={styles.selectHeader}>
          <Text style={styles.appName}>VICTOIRES IMF</Text>
          <Text style={styles.appNameAccent}>PUBG</Text>
          <Text style={styles.selectSubtitle}>Qui es-tu ?</Text>
        </View>
        <View style={styles.playerList}>
          {GROUP_PLAYERS.map((name) => (
            <TouchableOpacity
              key={name}
              style={styles.playerBtn}
              onPress={() => handleSelectPlayer(name)}
            >
              <View style={styles.playerBtnAvatar}>
                <Text style={styles.playerBtnAvatarText}>{name[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.playerBtnText}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
  },
  selectHeader: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 48,
  },
  appName: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  appNameAccent: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 8,
    lineHeight: 52,
  },
  selectSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 16,
    letterSpacing: 1,
  },
  playerList: {
    gap: 12,
  },
  playerBtn: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playerBtnAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '33',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerBtnAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },
  playerBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 0.5,
  },
});
