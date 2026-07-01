import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? 'BONdBeXikx5AxrrXl7_LQ_ZTNPoxlSuo0aqJF-82bHtlbXLNV5VQMqUjnyYE5B6z1zxMKn8SvcxcakIWosumUFY';

export async function registerWebPush(username: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!VAPID_PUBLIC_KEY) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJson = subscription.toJSON() as any;
    const endpoint = subJson.endpoint;

    await supabase.from('web_push_subscriptions').upsert({
      username,
      endpoint,
      subscription: subJson,
    }, { onConflict: 'endpoint' });
  } catch (e) {
    console.warn('Web push registration failed:', e);
  }
}

// Stub — le rappel dispo est géré côté serveur par l'Edge Function send-reminders
export async function sendWebPush(_title: string, _body: string): Promise<void> {
  return;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
