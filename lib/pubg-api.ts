import { GROUP_PLAYERS } from '../constants/players';
import { supabase } from './supabase';

export const PUBG_MAPS = [
  'Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Karakin', 'Taego', 'Deston', 'Rondo', 'Paramo',
];

export const PUBG_MAP_NAMES: Record<string, string> = {
  Baltic_Main: 'Erangel',
  Erangel_Main: 'Erangel',
  Desert_Main: 'Miramar',
  Savage_Main: 'Sanhok',
  Heaven_Main: 'Sanhok',
  DihorOtok_Main: 'Vikendi',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Kiki_Main: 'Deston',
  Neon_Main: 'Rondo',
  Chimera_Main: 'Paramo',
};

export interface SeasonHighlights {
  totalWins: number;
  totalMatches: number;
  totalKills: number;
  totalDamage: number;
  topFragger: { username: string; kills: number } | null;
  topAssist: { username: string; assists: number } | null;
  topDamage: { username: string; damage: number } | null;
}

async function getStatsBetween(startDate: string, endDate: string): Promise<SeasonHighlights> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('*')
    .gte('match_date', startDate)
    .lte('match_date', endDate);

  if (!data || data.length === 0) {
    return { totalWins: 0, totalMatches: 0, totalKills: 0, totalDamage: 0, topFragger: null, topAssist: null, topDamage: null };
  }

  const winningMatches = new Set(data.filter((r) => r.is_win).map((r) => r.match_id));
  const allMatches = new Set(data.map((r) => r.match_id));
  const totalKills = data.reduce((sum: number, r: any) => sum + r.kills, 0);
  const totalDamage = Math.round(data.reduce((sum: number, r: any) => sum + r.damage, 0));

  const byPlayer: Record<string, { kills: number; assists: number; damage: number }> = {};
  for (const row of data) {
    if (!byPlayer[row.player_username]) {
      byPlayer[row.player_username] = { kills: 0, assists: 0, damage: 0 };
    }
    byPlayer[row.player_username].kills += row.kills;
    byPlayer[row.player_username].assists += row.assists;
    byPlayer[row.player_username].damage += row.damage;
  }

  const entries = Object.entries(byPlayer);
  const topFragger = [...entries].sort((a, b) => b[1].kills - a[1].kills)[0];
  const topAssist = [...entries].sort((a, b) => b[1].assists - a[1].assists)[0];
  const topDamage = [...entries].sort((a, b) => b[1].damage - a[1].damage)[0];

  return {
    totalWins: winningMatches.size,
    totalMatches: allMatches.size,
    totalKills,
    totalDamage,
    topFragger: topFragger ? { username: topFragger[0], kills: topFragger[1].kills } : null,
    topAssist: topAssist ? { username: topAssist[0], assists: topAssist[1].assists } : null,
    topDamage: topDamage ? { username: topDamage[0], damage: Math.round(topDamage[1].damage) } : null,
  };
}

// Compatibilité avec l'ancien nom utilisé dans index.tsx
export type MonthlyStats = SeasonHighlights;

export async function getMonthlyStats(year: number, month: number): Promise<SeasonHighlights> {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
  return getStatsBetween(startDate, endDate);
}

export async function getImfSeasonHighlights(
  startDate: string,
  endDate: string,
  manualWinsCount?: number
): Promise<SeasonHighlights> {
  const start = new Date(startDate + 'T00:00:00').toISOString();
  const end = new Date(endDate + 'T23:59:59').toISOString();
  const stats = await getStatsBetween(start, end);
  if (manualWinsCount !== undefined) {
    return { ...stats, totalWins: stats.totalWins + manualWinsCount };
  }
  return stats;
}

// Agrège les stats depuis player_season_stats (données historiques complètes)
// en filtrant les saisons PUBG dont l'ID (format YYYY-MM) est dans la plage IMF.

export async function getFinisherStats(
  startDate?: string,
  endDate?: string,
  manualWins?: { finisher: string | null }[]
): Promise<{ username: string; count: number }[]> {
  let query = supabase
    .from('match_cache')
    .select('finisher, match_date')
    .not('finisher', 'is', null);

  if (startDate) query = query.gte('match_date', new Date(startDate + 'T00:00:00').toISOString());
  if (endDate) query = query.lte('match_date', new Date(endDate + 'T23:59:59').toISOString());

  const { data } = await query;

  const counts: Record<string, number> = {};
  const lastDate: Record<string, string> = {};
  for (const p of GROUP_PLAYERS) counts[p] = 0;
  let zoneBleueCount = 0;

  if (data) {
    for (const row of data) {
      if (row.finisher === 'Zone bleue') {
        zoneBleueCount++;
      } else if (row.finisher in counts) {
        counts[row.finisher]++;
        if (!lastDate[row.finisher] || row.match_date > lastDate[row.finisher]) {
          lastDate[row.finisher] = row.match_date;
        }
      }
    }
  }

  if (manualWins) {
    for (const w of manualWins) {
      if (w.finisher === 'Zone bleue') zoneBleueCount++;
      else if (w.finisher && w.finisher in counts) counts[w.finisher]++;
    }
  }

  const playerStats = Object.entries(counts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (lastDate[b[0]] ?? '') > (lastDate[a[0]] ?? '') ? 1 : -1;
    })
    .map(([username, count]) => ({ username, count }));

  return zoneBleueCount > 0
    ? [...playerStats, { username: 'Zone bleue', count: zoneBleueCount }]
    : playerStats;
}

export async function getTopMaps(
  startDate: string,
  endDate: string,
  manualWins?: { mapName: string | null }[],
  limit = 5
): Promise<{ mapName: string; wins: number }[]> {
  const start = new Date(startDate + 'T00:00:00').toISOString();
  const end = new Date(endDate + 'T23:59:59').toISOString();

  const counts: Record<string, number> = {};

  const { data: winRows } = await supabase
    .from('player_match_stats')
    .select('match_id')
    .eq('is_win', true)
    .gte('match_date', start)
    .lte('match_date', end);

  if (winRows && winRows.length > 0) {
    const winMatchIds = [...new Set(winRows.map((r) => r.match_id))];
    const { data: mapRows } = await supabase
      .from('match_cache')
      .select('map_name')
      .in('match_id', winMatchIds)
      .not('map_name', 'is', null);

    for (const row of mapRows ?? []) {
      const display = PUBG_MAP_NAMES[row.map_name] ?? row.map_name;
      counts[display] = (counts[display] ?? 0) + 1;
    }
  }

  if (manualWins) {
    for (const w of manualWins) {
      if (w.mapName) counts[w.mapName] = (counts[w.mapName] ?? 0) + 1;
    }
  }

  if (Object.keys(counts).length === 0) return [];

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([mapName, wins]) => ({ mapName, wins }));
}

export interface LastMatch {
  matchId: string;
  matchDate: Date;
  isWin: boolean;
  finisher: string | null;
  mapName: string | null;
  placement: number | null;
  totalTeams: number | null;
  players: { username: string; kills: number; assists: number; damage: number }[];
}

async function buildLastMatchFromRows(
  rows: any[],
  opts: { forceWin?: boolean } = {}
): Promise<LastMatch | null> {
  if (!rows.length) return null;

  const byMatch = new Map<string, any[]>();
  for (const row of rows) {
    if (!byMatch.has(row.match_id)) byMatch.set(row.match_id, []);
    byMatch.get(row.match_id)!.push(row);
  }

  for (const [matchId, matchRows] of byMatch) {
    const usernames = new Set(matchRows.map((r: any) => r.player_username));
    if (!GROUP_PLAYERS.every((p) => usernames.has(p))) continue;

    const firstRow = matchRows[0];
    const isWin = opts.forceWin ?? matchRows.some((r: any) => r.is_win);
    const placement = firstRow?.win_place ?? null;

    const { data: cache } = await supabase
      .from('match_cache')
      .select('map_name, finisher')
      .eq('match_id', matchId)
      .single();

    return {
      matchId,
      matchDate: new Date(firstRow.match_date),
      isWin,
      finisher: cache?.finisher ?? null,
      mapName: cache?.map_name ?? null,
      placement,
      totalTeams: null,
      players: matchRows.map((r: any) => ({
        username: r.player_username,
        kills: r.kills,
        assists: r.assists,
        damage: Math.round(r.damage),
      })),
    };
  }

  return null;
}

export async function getLastMatch(): Promise<LastMatch | null> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('match_id, match_date, is_win, kills, assists, damage, player_username, win_place')
    .order('match_date', { ascending: false })
    .limit(40);
  return buildLastMatchFromRows(data ?? []);
}

export async function getLastWin(): Promise<LastMatch | null> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('match_id, match_date, kills, assists, damage, player_username')
    .eq('is_win', true)
    .order('match_date', { ascending: false })
    .limit(20);

  return buildLastMatchFromRows(data ?? [], { forceWin: true });
}

