import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerWebPush(username: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!VAPID_PUBLIC_KEY) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await supabase.from('web_push_subscriptions').upsert({
      username,
      endpoint: sub.endpoint,
      subscription: JSON.parse(JSON.stringify(sub)),
    }, { onConflict: 'endpoint' });
  } catch {
    // Silent fail
  }
}

export async function sendWebPush(title: string, body: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const { data } = await supabase.from('web_push_subscriptions').select('subscription');
    if (!data || data.length === 0) return;
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptions: data.map((r) => r.subscription), title, body }),
    });
  } catch {
    // Silent fail
  }
}
