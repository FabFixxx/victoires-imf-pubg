import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// In Expo Go, push notifications require a standalone/EAS build.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerPushToken(username: string): Promise<string | null> {
  if (isExpoGo) return null;
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('sessions', {
      name: 'Sessions de jeu',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F5A623',
    });
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      'db458e49-84af-48e4-a5e5-b212dfeb7e84';

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    const token = tokenData.data;

    await supabase
      .from('players')
      .update({ expo_push_token: token })
      .eq('username', username);

    return token;
  } catch (e) {
    console.warn('Push token registration failed:', e);
    return null;
  }
}

export async function scheduleSundayReminder(): Promise<void> {
  if (isExpoGo) return;
  try {
    await Notifications.cancelScheduledNotificationAsync('sunday-dispo-reminder').catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: 'sunday-dispo-reminder',
      content: {
        title: '🎮 Victoires IMF',
        body: 'Renseigne tes disponibilités pour la semaine !',
        data: { type: 'dispo_reminder' },
        channelId: 'sessions',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1, // Dimanche (1=Dim, 2=Lun, ..., 7=Sam)
        hour: 19,
        minute: 0,
      },
    });
  } catch (e) {
    console.warn('Failed to schedule Sunday reminder:', e);
  }
}

export async function notifyAllAvailabilityFilled(
  bestDates: Array<{ date: string; players: string[] }>
): Promise<void> {
  const dateStr = bestDates
    .slice(0, 3)
    .map((d) =>
      new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    )
    .join(', ');

  const title = '✅ Tout le monde a répondu !';
  const body = `Meilleure(s) date(s) : ${dateStr}`;

  // Expo push (Android)
  if (!isExpoGo) {
    const { data: players } = await supabase
      .from('players')
      .select('expo_push_token')
      .not('expo_push_token', 'is', null);
    const tokens = (players ?? []).map((p) => p.expo_push_token).filter(Boolean);
    if (tokens.length > 0) {
      try {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            tokens.map((token) => ({
              to: token,
              title,
              body,
              data: { type: 'all_responded' },
              channelId: 'sessions',
            }))
          ),
        });
      } catch (e) {
        console.warn('Failed to send expo push notification:', e);
      }
    }
  }

  // Web push (iOS PWA)
  const { sendWebPush } = await import('./web-push-client');
  await sendWebPush(title, body);
}

export async function sendSessionProposalNotification(
  proposedBy: string,
  proposedDate: string,
  message?: string
): Promise<void> {
  if (isExpoGo) {
    console.log('[Expo Go] Notification simulée pour:', proposedBy, proposedDate);
    return;
  }

  const { data: players } = await supabase
    .from('players')
    .select('expo_push_token, username')
    .not('expo_push_token', 'is', null)
    .neq('username', proposedBy);

  if (!players || players.length === 0) return;

  const tokens = players
    .map((p) => p.expo_push_token)
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) return;

  const body = message || `Session proposée pour le ${proposedDate}`;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        tokens.map((token) => ({
          to: token,
          title: `🎮 ${proposedBy} propose une session !`,
          body,
          data: { type: 'session_proposal', proposedDate },
          channelId: 'sessions',
        }))
      ),
    });
  } catch (e) {
    console.warn('Failed to send push notifications:', e);
  }
}
