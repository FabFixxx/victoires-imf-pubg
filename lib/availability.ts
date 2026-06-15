import { supabase } from './supabase';
import { GROUP_PLAYERS } from '../constants/players';

export const PLAYER_COLORS: Record<string, string> = {
  FabFix: '#4FC3F7',
  Nicotom: '#F44336',
  petittom: '#F5A623',
  Jibby37: '#81C784',
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
      const bestDates = avail
        .filter((d) => d.players.length >= 2)
        .sort((a, b) => b.players.length - a.players.length || a.date.localeCompare(b.date))
        .slice(0, 3);
      return { found: true, weekStart: startStr, bestDates };
    }
  }

  return { found: false, weekStart: '', bestDates: [] };
}
