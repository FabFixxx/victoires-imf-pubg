import AsyncStorage from '@react-native-async-storage/async-storage';

const CURRENT_PLAYER_KEY = '@imf_current_player';

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
