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

