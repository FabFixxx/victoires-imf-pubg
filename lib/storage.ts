import AsyncStorage from '@react-native-async-storage/async-storage';

const CURRENT_PLAYER_KEY = '@imf_current_player';
const LAST_SYNC_KEY = '@imf_last_sync';
const LAST_NOTIF_VIEW_KEY = '@imf_last_notif_view';

// In-memory fallback if AsyncStorage fails
const mem: Record<string, string> = {};

export async function getCurrentPlayer(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CURRENT_PLAYER_KEY);
  } catch {
    return mem[CURRENT_PLAYER_KEY] ?? null;
  }
}

export async function setCurrentPlayer(username: string): Promise<void> {
  mem[CURRENT_PLAYER_KEY] = username;
  try {
    await AsyncStorage.setItem(CURRENT_PLAYER_KEY, username);
  } catch {}
}

export async function getLastSync(): Promise<Date | null> {
  try {
    const val = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return val ? new Date(val) : null;
  } catch {
    const val = mem[LAST_SYNC_KEY];
    return val ? new Date(val) : null;
  }
}

export async function setLastSync(date: Date): Promise<void> {
  const val = date.toISOString();
  mem[LAST_SYNC_KEY] = val;
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, val);
  } catch {}
}

export async function getLastNotificationView(): Promise<Date | null> {
  try {
    const val = await AsyncStorage.getItem(LAST_NOTIF_VIEW_KEY);
    return val ? new Date(val) : null;
  } catch {
    const val = mem[LAST_NOTIF_VIEW_KEY];
    return val ? new Date(val) : null;
  }
}

export async function setLastNotificationView(date: Date): Promise<void> {
  const val = date.toISOString();
  mem[LAST_NOTIF_VIEW_KEY] = val;
  try {
    await AsyncStorage.setItem(LAST_NOTIF_VIEW_KEY, val);
  } catch {}
}
