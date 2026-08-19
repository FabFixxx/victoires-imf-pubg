import 'react-native-url-polyfill/auto';
import { Stack, router } from 'expo-router';
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
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { Colors } from '../constants/colors';
import { getCurrentPlayer, setCurrentPlayer, getLastSync, setLastSync } from '../lib/storage';
import { GROUP_PLAYERS, getDisplayName } from '../constants/players';
import { PLAYER_COLORS } from '../lib/availability';
import { registerPushToken, refreshAppBadge } from '../lib/notifications';
import { syncData } from '../lib/pubg-api';
import { checkForUpdate } from '../lib/update-check';
import { registerWebPush } from '../lib/web-push-client';

// Ouvre directement la page des notifications quand l'utilisateur tape sur un push
// dont le data.screen le demande (voir sendPushToAll côté edge function).
function openNotificationsIfRequested(data: any) {
  if (data?.screen === 'notifications') {
    router.push({ pathname: '/(tabs)', params: { openNotifications: '1' } });
  }
}

type InitState = 'loading' | 'select' | 'ready';

export default function RootLayout() {
  const [initState, setInitState] = useState<InitState>('loading');
  const [currentPlayer, setPlayer] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // `settled` départage qui décide en premier entre le timeout de secours et la résolution
    // du storage : sans ça, un storage lent qui répond juste après le timeout pouvait faire
    // basculer l'utilisateur de l'écran "Qui es-tu ?" vers l'app tout seul, sans qu'il ait rien fait.
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      setInitState('select');
    }, 3000);
    (async () => {
      try {
        const player = await getCurrentPlayer();
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!player) {
          setInitState('select');
        } else {
          setPlayer(player);
          setInitState('ready');
          registerPushToken(player);
          registerWebPush(player);
          triggerAutoSync();
          refreshAppBadge(player);
          checkForUpdate().then((info) => {
            if (!info || Platform.OS === 'web') return;
            Alert.alert(
              '🆕 Mise à jour disponible',
              `La version ${info.version} est disponible. Tu peux voir les nouveautés dans Réglages → Version.`,
              [
                { text: 'Plus tard', style: 'cancel' },
                {
                  text: 'Mettre à jour',
                  onPress: () => Linking.openURL(info.downloadUrl),
                },
              ]
            );
          }).catch((e) => console.error('[RootLayout] checkForUpdate failed:', e));
        }
      } catch {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        setInitState('select');
      }
    })();
    return () => { settled = true; clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Victoires IMF PUBG';
    }
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
    registerPushToken(name);
    registerWebPush(name);
    triggerAutoSync();
    refreshAppBadge(name);
  };

  // Tap sur une notif reçue pendant que l'app tourne (foreground/background) → navigation.
  // Cold-start via tap géré séparément par getLastNotificationResponseAsync ci-dessous.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationsIfRequested(response.notification.request.content.data);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        openNotificationsIfRequested(response.notification.request.content.data);
        // Sans ça, cette réponse mémorisée par le système est rejouée à CHAQUE redémarrage
        // de l'app tant qu'aucun nouveau tap n'a lieu — l'app rouvrirait sans arrêt la page
        // notifications même quand l'utilisateur n'a rien tapé cette fois.
        Notifications.clearLastNotificationResponseAsync();
      }
    });
    return () => sub.remove();
  }, []);

  // Le badge de l'app peut devenir périmé si l'app reste en arrière-plan pendant qu'une
  // notif arrive : on le resynchronise à chaque retour au premier plan.
  useEffect(() => {
    if (initState !== 'ready' || !currentPlayer) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAppBadge(currentPlayer);
    });
    return () => sub.remove();
  }, [initState, currentPlayer]);

  if (initState === 'loading') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.loading}>
          <StatusBar style="light" />
          <Text style={styles.appName}>VICTOIRES IMF</Text>
          <Text style={styles.appNameAccent}>PUBG</Text>
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
        </View>
      </GestureHandlerRootView>
    );
  }

  if (initState === 'select') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.selectContainer}>
          <StatusBar style="light" />
          <View style={styles.selectHeader}>
            <Text style={styles.appName}>VICTOIRES IMF</Text>
            <Text style={styles.appNameAccent}>PUBG</Text>
            <Text style={styles.selectSubtitle}>Qui es-tu ?</Text>
          </View>
          <View style={styles.playerList}>
            {GROUP_PLAYERS.map((name) => {
              const color = PLAYER_COLORS[name] ?? Colors.primary;
              return (
                <TouchableOpacity
                  key={name}
                  style={styles.playerBtn}
                  onPress={() => handleSelectPlayer(name)}
                >
                  <View style={[styles.playerBtnAvatar, { borderColor: color, backgroundColor: color + '33' }]}>
                    <Text style={[styles.playerBtnAvatarText, { color }]}>{getDisplayName(name)[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.playerBtnText}>{getDisplayName(name)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
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
