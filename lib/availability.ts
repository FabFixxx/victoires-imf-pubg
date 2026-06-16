import { supabase } from './supabase';
import { GROUP_PLAYERS } from '../constants/players';

export const PLAYER_COLORS: Record<string, string> = {
  FabFix: '#359bcf',
  Nicotom: '#db7334',
  petittom: '#e2e127',
  Jibby37: '#4ba157',
};

export interface DayAvailability {
  date: string; // 'YYYY-MM-DD'
  players: string[];
}

function toDateStr(val: any): string {
  return typeof val === 'string' ? val.split('T')[0] : String(val);
}

export async function getAvailability(startDate: string, endDate: string): Promise<DayAvailability[]> {
  const { data } = await supabase
    .from('player_availability')
    .select('player_username, date')
    .gte('date', startDate)
    .lte('date', endDate);

  if (!data) return [];

  const byDate: Record<string, string[]> = {};
  for (const row of data) {
    const d = toDateStr(row.date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(row.player_username);
  }

  return Object.entries(byDate).map(([date, players]) => ({ date, players }));
}

export async function toggleAvailability(username: string, date: string): Promise<boolean> {
  const { data } = await supabase
    .from('player_availability')
    .select('id')
    .eq('player_username', username)
    .eq('date', date)
    .maybeSingle();

  if (data) {
    await supabase.from('player_availability').delete()
      .eq('player_username', username)
      .eq('date', date);
    return false;
  } else {
    await supabase.from('player_availability').insert({ player_username: username, date });
    return true;
  }
}

// ── Aucune dispo ──

export async function addNoAvailability(username: string, weekStart: string): Promise<void> {
  await supabase.from('week_no_availability').upsert(
    { player_username: username, week_start: weekStart },
    { onConflict: 'player_username,week_start' }
  );
}

export async function removeNoAvailability(username: string, weekStart: string): Promise<void> {
  await supabase.from('week_no_availability').delete()
    .eq('player_username', username)
    .eq('week_start', weekStart);
}

export async function deleteAvailabilityForWeek(username: string, weekStart: string, weekEnd: string): Promise<void> {
  await supabase.from('player_availability').delete()
    .eq('player_username', username)
    .gte('date', weekStart)
    .lte('date', weekEnd);
}

export async function getNoAvailability(weekStart: string): Promise<string[]> {
  const { data } = await supabase
    .from('week_no_availability')
    .select('player_username')
    .eq('week_start', weekStart);
  return (data ?? []).map((r: any) => r.player_username);
}

// ── Date retenue ──

export interface ChosenDate {
  weekStart: string;
  chosenDate: string;
  isManual: boolean;
}

export async function getChosenDate(weekStart: string): Promise<ChosenDate | null> {
  const { data } = await supabase
    .from('chosen_dates')
    .select('week_start, chosen_date, is_manual')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (!data) return null;
  return { weekStart: data.week_start, chosenDate: data.chosen_date, isManual: data.is_manual };
}

export async function setChosenDate(weekStart: string, chosenDate: string): Promise<void> {
  await supabase.from('chosen_dates').upsert(
    { week_start: weekStart, chosen_date: chosenDate, is_manual: true },
    { onConflict: 'week_start' }
  );
}

// ── Préférences de notifications ──

export interface NotificationPrefs {
  reminderHour: number;
  gameDayHour: number;
}

export async function getNotificationPrefs(username: string): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('reminder_hour, game_day_hour')
    .eq('player_username', username)
    .maybeSingle();
  return { reminderHour: data?.reminder_hour ?? 17, gameDayHour: data?.game_day_hour ?? 18 };
}

export async function saveNotificationPrefs(username: string, prefs: NotificationPrefs): Promise<void> {
  await supabase.from('notification_preferences').upsert(
    { player_username: username, reminder_hour: prefs.reminderHour, game_day_hour: prefs.gameDayHour, updated_at: new Date().toISOString() },
    { onConflict: 'player_username' }
  );
}

// Vérifie si les 4 joueurs ont au moins 1 dispo sur une même semaine (lun-dim)
// Cherche dans les 4 prochaines semaines, retourne la première semaine complète trouvée
export async function checkWeekAllResponded(): Promise<{
  found: boolean;
  weekStart: string;
  bestDates: DayAvailability[];
}> {
  const today = new Date();
  // Lundi de la semaine courante
  const dayOfWeek = today.getDay(); // 0=dim
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysToMonday);

  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(monday);
    weekStart.setDate(monday.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startStr = weekStart.toISOString().split('T')[0];
    const endStr = weekEnd.toISOString().split('T')[0];

    const avail = await getAvailability(startStr, endStr);
    const respondedPlayers = new Set(avail.flatMap((d) => d.players));
    const allResponded = (GROUP_PLAYERS as readonly string[]).every((p) => respondedPlayers.has(p));

    if (allResponded) {
      const fourVotes = avail.filter((d) => d.players.length === 4).sort((a, b) => a.date.localeCompare(b.date));
      const threeVotes = avail.filter((d) => d.players.length === 3).sort((a, b) => a.date.localeCompare(b.date));
      const bestDates = fourVotes.length > 0 ? fourVotes : threeVotes;
      if (bestDates.length === 0) continue;
      return { found: true, weekStart: startStr, bestDates };
    }
  }

  return { found: false, weekStart: '', bestDates: [] };
}
