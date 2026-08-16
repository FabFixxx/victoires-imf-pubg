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
  isRead: boolean;
}

// Lecture par joueur (table notification_reads), pas un simple repère temporel local :
// survit à une réinstallation de l'app et se synchronise si un joueur utilise plusieurs
// appareils (PWA + APK par exemple), contrairement à un timestamp stocké en AsyncStorage.
export async function getRecentNotifications(username: string, limit = 30): Promise<NotificationHistoryItem[]> {
  const { data: notifs, error } = await supabase
    .from('notification_history')
    .select('id, title, body, type, sent_at')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[getRecentNotifications] failed:', error.message);
    return [];
  }
  if (!notifs || notifs.length === 0) return [];

  const ids = notifs.map((n: any) => n.id);
  const { data: reads, error: readsError } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('player_username', username)
    .in('notification_id', ids);
  if (readsError) console.error('[getRecentNotifications] reads lookup failed:', readsError.message);
  const readIds = new Set((reads ?? []).map((r: any) => r.notification_id));

  return notifs.map((n: any) => ({ ...n, isRead: readIds.has(n.id) }));
}

// Comptage exact via COUNT en base plutôt que fetch+filtre d'une page limitée : reste correct
// quel que soit le volume de notifications, sans plafond arbitraire ni boucle de pagination.
export async function getUnreadNotificationCount(username: string): Promise<number> {
  const { count: total, error: totalError } = await supabase
    .from('notification_history')
    .select('id', { count: 'exact', head: true });
  if (totalError) {
    console.error('[getUnreadNotificationCount] total count failed:', totalError.message);
    return 0;
  }

  const { count: readCount, error: readError } = await supabase
    .from('notification_reads')
    .select('id', { count: 'exact', head: true })
    .eq('player_username', username);
  if (readError) {
    console.error('[getUnreadNotificationCount] read count failed:', readError.message);
    return 0;
  }

  return Math.max(0, (total ?? 0) - (readCount ?? 0));
}

export async function markNotificationsAsRead(username: string, notificationIds: string[]): Promise<void> {
  if (notificationIds.length > 0) {
    const rows = notificationIds.map((id) => ({ player_username: username, notification_id: id }));
    const { error } = await supabase
      .from('notification_reads')
      .upsert(rows, { onConflict: 'player_username,notification_id', ignoreDuplicates: true });
    if (error) console.error('[markNotificationsAsRead] failed:', error.message);
  }
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

export async function refreshAppBadge(username: string): Promise<void> {
  const count = await getUnreadNotificationCount(username);
  await updateAppBadge(count);
}

