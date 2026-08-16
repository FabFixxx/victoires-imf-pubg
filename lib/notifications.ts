import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { getLastNotificationView, setLastNotificationView } from './storage';

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

    // .select() pour détecter le cas silencieux où `username` ne correspond à aucune ligne
    // (0 ligne affectée) : sans ça, l'appel semble réussir alors que rien n'est persisté.
    const { data: updated, error } = await supabase
      .from('players')
      .update({ expo_push_token: token })
      .eq('username', username)
      .select('username');

    if (error) {
      console.error('[registerPushToken] update failed:', error.message);
    } else if (!updated || updated.length === 0) {
      console.warn(`[registerPushToken] aucune ligne "players" pour username="${username}" — token non persisté`);
    }

    return token;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.warn('Push token registration failed:', msg);
    await supabase.from('notification_log').insert({
      type: 'push_token_error',
      key: username + ': ' + msg,
    }).then(() => {});
    return null;
  }
}

export interface NotificationHistoryItem {
  id: string;
  title: string;
  body: string;
  type: string | null;
  sent_at: string;
}

export async function getRecentNotifications(limit = 30): Promise<NotificationHistoryItem[]> {
  const { data, error } = await supabase
    .from('notification_history')
    .select('id, title, body, type, sent_at')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[getRecentNotifications] failed:', error.message);
    return [];
  }
  return data ?? [];
}

// null = pas encore initialisé (avant cette fonctionnalité) : on ne compte alors rien comme non
// lu, pour ne pas noyer l'utilisateur sous tout l'historique passé au premier lancement.
export async function getUnreadNotificationCount(): Promise<number> {
  const lastView = await getLastNotificationView();
  if (!lastView) return 0;
  const { count, error } = await supabase
    .from('notification_history')
    .select('id', { count: 'exact', head: true })
    .gt('sent_at', lastView.toISOString());
  if (error) {
    console.error('[getUnreadNotificationCount] failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

// Initialise le repère "dernière consultation" à maintenant s'il n'existe pas encore
// (premier lancement après l'ajout de cette fonctionnalité).
export async function ensureNotificationViewBootstrapped(): Promise<void> {
  const lastView = await getLastNotificationView();
  if (!lastView) await setLastNotificationView(new Date());
}

export async function markNotificationsAsRead(): Promise<void> {
  await setLastNotificationView(new Date());
  await updateAppBadge(0);
}

export async function updateAppBadge(count: number): Promise<void> {
  // Web (PWA ajoutée à l'écran d'accueil, iOS 16.4+) : Badging API standard du navigateur,
  // pas l'API native — setBadgeCountAsync d'expo-notifications n'est pas fiable sur web.
  if (Platform.OS === 'web') {
    try {
      const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
      if (nav && 'setAppBadge' in nav) {
        if (count > 0) await nav.setAppBadge(count);
        else await nav.clearAppBadge();
      }
    } catch {}
    return;
  }

  if (isExpoGo) return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {}
}

export async function refreshAppBadge(): Promise<void> {
  const count = await getUnreadNotificationCount();
  await updateAppBadge(count);
}

