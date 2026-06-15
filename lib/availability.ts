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

// Vérifie si les 4 joueurs ont au moins 1 dispo dans les 60 prochains jours
export async function checkAllRespondedNextWeek(): Promise<{
  allResponded: boolean;
  bestDates: DayAvailability[];
}> {
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const end = new Date(today);
  end.setDate(today.getDate() + 60);
  const endDate = end.toISOString().split('T')[0];

  const avail = await getAvailability(startDate, endDate);
  const respondedPlayers = new Set(avail.flatMap((d) => d.players));
  const allResponded = (GROUP_PLAYERS as readonly string[]).every((p) => respondedPlayers.has(p));

  if (!allResponded) return { allResponded: false, bestDates: [] };

  const maxCount = Math.max(...avail.map((d) => d.players.length), 0);
  const bestDates = avail
    .filter((d) => d.players.length >= 2)
    .sort((a, b) => b.players.length - a.players.length || a.date.localeCompare(b.date))
    .slice(0, 5);

  return { allResponded, bestDates };
}
