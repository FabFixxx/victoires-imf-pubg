import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? 'BCx2eoyWs_QpKBUWdE2X07YHy3pvvx8rVUnj7unJIxHxAfICueIz3p_68iK4uIvakZOFVj0fg9EKgjloHNnuCPo';

export async function registerWebPush(username: string): Promise<void> {
  if (Platform.OS !== 'web') return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    if (permission !== 'granted') return;

    const existing = await registration.pushManager.getSubscription();
    let subscription = existing;

    if (existing) {
      const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const existingKeyBuffer = existing.options?.applicationServerKey as ArrayBuffer | null;
      const existingKey = existingKeyBuffer ? new Uint8Array(existingKeyBuffer) : null;
      const keysMatch = existingKey &&
        existingKey.length === currentKey.length &&
        currentKey.every((v, i) => v === existingKey[i]);

      if (!keysMatch) {
        await existing.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const subJson = subscription.toJSON() as any;
    await supabase.from('web_push_subscriptions').delete().eq('username', username);
    await supabase.from('web_push_subscriptions').insert({
      username,
      endpoint: subJson.endpoint ?? '',
      subscription: subJson,
    });
  } catch (e: any) {
    console.warn('Web push registration failed:', e?.message ?? String(e));
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
