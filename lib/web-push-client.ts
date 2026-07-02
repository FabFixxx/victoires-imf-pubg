import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? 'BONdBeXikx5AxrrXl7_LQ_ZTNPoxlSuo0aqJF-82bHtlbXLNV5VQMqUjnyYE5B6z1zxMKn8SvcxcakIWosumUFY';

async function logWebPush(username: string, msg: string, extra?: Record<string, any>) {
  const value = extra ? `${msg} | ${JSON.stringify(extra)}` : msg;
  console.log(`[web-push][${username}] ${value}`);
  await supabase.from('notification_log').insert({
    type: 'web_push_debug',
    key: `${username}: ${value}`,
    sent_at: new Date().toISOString(),
  }).then(() => {});
}

export async function registerWebPush(username: string): Promise<void> {
  if (Platform.OS !== 'web') return;

  await logWebPush(username, 'start registerWebPush', {
    ua: navigator.userAgent.slice(0, 80),
    standalone: (navigator as any).standalone ?? 'n/a',
  });

  if (!('serviceWorker' in navigator)) {
    await logWebPush(username, 'FAIL: no serviceWorker in navigator');
    return;
  }
  if (!('PushManager' in window)) {
    await logWebPush(username, 'FAIL: no PushManager in window');
    return;
  }
  if (!VAPID_PUBLIC_KEY) {
    await logWebPush(username, 'FAIL: no VAPID_PUBLIC_KEY');
    return;
  }

  await logWebPush(username, 'serviceWorker + PushManager OK, registering sw.js...');

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await logWebPush(username, 'SW registered', { scope: registration.scope, state: registration.active?.state ?? 'no active' });

    await navigator.serviceWorker.ready;
    await logWebPush(username, 'SW ready');

    const currentPermission = Notification.permission;
    await logWebPush(username, 'permission before request: ' + currentPermission);

    const permission = currentPermission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    await logWebPush(username, 'permission after request: ' + permission);

    if (permission !== 'granted') {
      await logWebPush(username, 'FAIL: permission not granted: ' + permission);
      return;
    }

    const existing = await registration.pushManager.getSubscription();
    await logWebPush(username, existing ? 'existing subscription found' : 'no existing subscription, subscribing...');

    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJson = subscription.toJSON() as any;
    const endpoint = subJson.endpoint ?? '';
    await logWebPush(username, 'subscription obtained', { endpoint: endpoint.slice(0, 60) + '...', hasKeys: !!subJson.keys });

    const { error } = await supabase.from('web_push_subscriptions').upsert({
      username,
      endpoint,
      subscription: subJson,
    }, { onConflict: 'endpoint' });

    if (error) {
      await logWebPush(username, 'FAIL: upsert error', { error: error.message });
    } else {
      await logWebPush(username, 'SUCCESS: subscription saved to web_push_subscriptions');
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.warn('Web push registration failed:', msg);
    await logWebPush(username, 'EXCEPTION: ' + msg);
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
