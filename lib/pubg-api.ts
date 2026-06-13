import { PUBG_API_KEY, PUBG_BASE_URL, GROUP_PLAYERS } from '../constants/config';
import { supabase } from './supabase';

const PUBG_HEADERS = {
  Authorization: `Bearer ${PUBG_API_KEY}`,
  Accept: 'application/vnd.api+json',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMIT_DELAY = 6200;

async function fetchPUBG(endpoint: string) {
  const res = await fetch(`${PUBG_BASE_URL}${endpoint}`, { headers: PUBG_HEADERS });
  if (!res.ok) throw new Error(`PUBG API ${res.status}: ${endpoint}`);
  return res.json();
}

export async function resolvePlayerIds(): Promise<Record<string, string>> {
  const { data: cached } = await supabase
    .from('players')
    .select('username, pubg_account_id')
    .not('pubg_account_id', 'is', null);

  if (cached && cached.length === GROUP_PLAYERS.length) {
    return Object.fromEntries(cached.map((p) => [p.username, p.pubg_account_id]));
  }

  const names = GROUP_PLAYERS.join(',');
  const data = await fetchPUBG(`/players?filter[playerNames]=${names}`);

  const ids: Record<string, string> = {};
  for (const player of data.data) {
    ids[player.attributes.name] = player.id;
  }

  await supabase.from('players').upsert(
    Object.entries(ids).map(([username, pubg_account_id]) => ({ username, pubg_account_id })),
    { onConflict: 'username' }
  );

  return ids;
}

export interface MatchData {
  matchId: string;
  matchDate: string;
  gameMode: string;
  players: {
    accountId: string;
    name: string;
    kills: number;
    assists: number;
    damageDealt: number;
    winPlace: number;
  }[];
}

async function fetchFinisher(telemetryUrl: string): Promise<string | null> {
  try {
    const res = await fetch(telemetryUrl);
    if (!res.ok) return null;
    const events: any[] = await res.json();
    const killEvents = events.filter((e) => e._T === 'LogPlayerKill');
    if (killEvents.length === 0) return null;
    killEvents.sort((a, b) => a._D.localeCompare(b._D));
    const lastKill = killEvents[killEvents.length - 1];
    return lastKill.killer?.name ?? null;
  } catch {
    return null;
  }
}

async function fetchAndCacheMatch(matchId: string): Promise<MatchData | null> {
  const { data: cached } = await supabase
    .from('match_cache')
    .select('data')
    .eq('match_id', matchId)
    .single();

  if (cached) return cached.data as MatchData;

  try {
    const raw = await fetchPUBG(`/matches/${matchId}`);
    const gameMode: string = raw.data.attributes.gameMode;

    if (!gameMode.includes('fpp')) return null;

    const participants = (raw.included as any[]).filter((i) => i.type === 'participant');

    const matchData: MatchData = {
      matchId,
      matchDate: raw.data.attributes.createdAt,
      gameMode,
      players: participants.map((p) => ({
        accountId: p.attributes.stats.playerId,
        name: p.attributes.stats.name,
        kills: p.attributes.stats.kills,
        assists: p.attributes.stats.assists,
        damageDealt: p.attributes.stats.damageDealt,
        winPlace: p.attributes.stats.winPlace,
      })),
    };

    const groupPlayers = matchData.players.filter((p) =>
      GROUP_PLAYERS.includes(p.name as (typeof GROUP_PLAYERS)[number])
    );

    const isGroupWin =
      groupPlayers.length === GROUP_PLAYERS.length &&
      groupPlayers.some((p) => p.winPlace === 1);

    // Finisher : uniquement sur les victoires à 4 joueurs
    let finisher: string | null = null;
    if (isGroupWin) {
      const telemetryAsset = (raw.included as any[]).find(
        (i) => i.type === 'asset' && i.attributes?.name === 'telemetry'
      );
      if (telemetryAsset?.attributes?.URL) {
        finisher = await fetchFinisher(telemetryAsset.attributes.URL);
      }
    }

    await supabase.from('match_cache').insert({
      match_id: matchId,
      match_date: matchData.matchDate,
      game_mode: gameMode,
      finisher,
      data: matchData,
    });

    // N'enregistrer les stats que si les 4 joueurs ont joué ensemble
    if (groupPlayers.length === GROUP_PLAYERS.length) {
      await supabase.from('player_match_stats').upsert(
        groupPlayers.map((p) => ({
          match_id: matchId,
          player_username: p.name,
          kills: p.kills,
          assists: p.assists,
          damage: p.damageDealt,
          win_place: p.winPlace,
          is_win: p.winPlace === 1,
          match_date: matchData.matchDate,
        })),
        { onConflict: 'match_id,player_username' }
      );
    }

    return matchData;
  } catch {
    return null;
  }
}

export async function syncData(onProgress?: (msg: string) => void): Promise<void> {
  onProgress?.('Récupération des IDs joueurs...');
  let accountIds: Record<string, string>;
  try {
    accountIds = await resolvePlayerIds();
    onProgress?.(`${Object.keys(accountIds).length} joueurs trouvés...`);
  } catch (e: any) {
    onProgress?.(`Erreur API PUBG: ${e?.message ?? 'inconnue'}`);
    throw e;
  }
  await sleep(RATE_LIMIT_DELAY);

  const allMatchIds = new Set<string>();

  for (const [username, accountId] of Object.entries(accountIds)) {
    onProgress?.(`Récupération des matchs de ${username}...`);
    try {
      const data = await fetchPUBG(`/players/${accountId}`);
      const matchIds: string[] = data.data.relationships.matches.data.map((m: any) => m.id);
      matchIds.forEach((id) => allMatchIds.add(id));
      await sleep(RATE_LIMIT_DELAY);
    } catch {
      onProgress?.(`Erreur pour ${username}, on continue...`);
    }
  }

  const { data: cachedRows } = await supabase
    .from('match_cache')
    .select('match_id')
    .in('match_id', Array.from(allMatchIds));

  const cachedSet = new Set(cachedRows?.map((m) => m.match_id) ?? []);
  const newIds = Array.from(allMatchIds).filter((id) => !cachedSet.has(id));

  onProgress?.(
    newIds.length > 0
      ? `${newIds.length} nouveaux matchs à synchroniser...`
      : 'Tout est à jour !'
  );

  for (let i = 0; i < Math.min(newIds.length, 30); i++) {
    await fetchAndCacheMatch(newIds[i]);
    if (i < newIds.length - 1) await sleep(RATE_LIMIT_DELAY);
    if ((i + 1) % 5 === 0 || i === newIds.length - 1) {
      onProgress?.(`Matchs synchronisés : ${i + 1}/${Math.min(newIds.length, 30)}`);
    }
  }

  onProgress?.('Synchronisation terminée !');
}

export interface SeasonHighlights {
  totalWins: number;
  topFragger: { username: string; kills: number } | null;
  topAssist: { username: string; assists: number } | null;
  topDamage: { username: string; damage: number } | null;
  totalMatches: number;
  totalKills: number;
}

async function getStatsBetween(startDate: string, endDate: string): Promise<SeasonHighlights> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('*')
    .gte('match_date', startDate)
    .lte('match_date', endDate);

  if (!data || data.length === 0) {
    return { totalWins: 0, topFragger: null, topAssist: null, topDamage: null, totalMatches: 0, totalKills: 0 };
  }

  const winningMatches = new Set(data.filter((r) => r.is_win).map((r) => r.match_id));
  const allMatches = new Set(data.map((r) => r.match_id));
  const totalKills = data.reduce((sum: number, r: any) => sum + r.kills, 0);

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
  manualWins?: number
): Promise<SeasonHighlights> {
  const start = new Date(startDate).toISOString();
  const end = new Date(endDate + 'T23:59:59').toISOString();
  const stats = await getStatsBetween(start, end);
  if (manualWins !== undefined) {
    return { ...stats, totalWins: manualWins };
  }
  return stats;
}

// Agrège les stats depuis player_season_stats (données historiques complètes)
// en filtrant les saisons PUBG dont l'ID (format YYYY-MM) est dans la plage IMF.
export async function getImfSeasonStatsFromSeasons(
  startDate: string,
  endDate: string,
  manualWins?: number
): Promise<SeasonHighlights> {
  const startYM = startDate.substring(0, 7); // 'YYYY-MM'
  const endYM = endDate.substring(0, 7);

  const { data } = await supabase
    .from('player_season_stats')
    .select('username, season_id, wins, kills, assists, damage');

  if (!data || data.length === 0) {
    return { totalWins: 0, topFragger: null, topAssist: null, topDamage: null, totalMatches: 0, totalKills: 0 };
  }

  const filtered = data.filter((row) => {
    const match = row.season_id.match(/(\d{4}-\d{2})$/);
    if (!match) return false;
    const ym = match[1];
    return ym >= startYM && ym <= endYM;
  });

  if (filtered.length === 0) {
    return { totalWins: 0, topFragger: null, topAssist: null, topDamage: null, totalMatches: 0, totalKills: 0 };
  }

  const byPlayer: Record<string, { wins: number; kills: number; assists: number; damage: number; matches: number }> = {};
  for (const row of filtered) {
    if (!byPlayer[row.username]) {
      byPlayer[row.username] = { wins: 0, kills: 0, assists: 0, damage: 0, matches: 0 };
    }
    byPlayer[row.username].wins += row.wins ?? 0;
    byPlayer[row.username].kills += row.kills ?? 0;
    byPlayer[row.username].assists += row.assists ?? 0;
    byPlayer[row.username].damage += row.damage ?? 0;
  }

  const players = Object.entries(byPlayer).map(([username, s]) => ({ username, ...s }));

  // Victoires groupe : override manuel si renseigné, sinon moyenne des joueurs
  const totalWins = manualWins !== undefined
    ? manualWins
    : Math.round(players.reduce((sum, p) => sum + p.wins, 0) / players.length);
  const totalKills = players.reduce((sum, p) => sum + p.kills, 0);

  const topFragger = [...players].sort((a, b) => b.kills - a.kills)[0];
  const topAssist = [...players].sort((a, b) => b.assists - a.assists)[0];
  const topDamage = [...players].sort((a, b) => b.damage - a.damage)[0];

  return {
    totalWins,
    totalMatches: 0,
    totalKills,
    topFragger: topFragger ? { username: topFragger.username, kills: topFragger.kills } : null,
    topAssist: topAssist ? { username: topAssist.username, assists: topAssist.assists } : null,
    topDamage: topDamage ? { username: topDamage.username, damage: Math.round(topDamage.damage) } : null,
  };
}

export interface PlayerStats {
  username: string;
  kills: number;
  assists: number;
  damage: number;
  wins: number;
  matches: number;
  kd: number;
  avgDamage: number;
  avgKills: number;
  winRate: number;
}

export async function getPlayerStats(username: string): Promise<PlayerStats> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('*')
    .eq('player_username', username);

  if (!data || data.length === 0) {
    return {
      username, kills: 0, assists: 0, damage: 0,
      wins: 0, matches: 0, kd: 0, avgDamage: 0, avgKills: 0, winRate: 0,
    };
  }

  const kills = data.reduce((s, r) => s + r.kills, 0);
  const assists = data.reduce((s, r) => s + r.assists, 0);
  const damage = Math.round(data.reduce((s, r) => s + r.damage, 0));
  const wins = data.filter((r) => r.is_win).length;
  const matches = data.length;
  const deaths = matches - wins;
  const kd = Math.round((deaths > 0 ? kills / deaths : kills) * 100) / 100;
  const avgDamage = Math.round(damage / matches);
  const avgKills = Math.round((kills / matches) * 10) / 10;
  const winRate = Math.round((wins / matches) * 100);

  return { username, kills, assists, damage, wins, matches, kd, avgDamage, avgKills, winRate };
}

export interface LastMatch {
  matchId: string;
  matchDate: Date;
  isWin: boolean;
  finisher: string | null;
  players: { username: string; kills: number; assists: number; damage: number }[];
}

export async function getLastMatch(): Promise<LastMatch | null> {
  const { data } = await supabase
    .from('player_match_stats')
    .select('match_id, match_date, is_win, kills, assists, damage, player_username')
    .order('match_date', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return null;

  const latestMatchId = data[0].match_id;
  const rows = data.filter((r) => r.match_id === latestMatchId);
  const isWin = rows.some((r) => r.is_win);

  let finisher: string | null = null;
  if (isWin) {
    const { data: cacheRow } = await supabase
      .from('match_cache')
      .select('finisher')
      .eq('match_id', latestMatchId)
      .single();
    finisher = cacheRow?.finisher ?? null;
  }

  return {
    matchId: latestMatchId,
    matchDate: new Date(data[0].match_date),
    isWin,
    finisher,
    players: rows.map((r) => ({
      username: r.player_username,
      kills: r.kills,
      assists: r.assists,
      damage: Math.round(r.damage),
    })),
  };
}

export async function getTopFinisher(startDate?: string, endDate?: string): Promise<{ username: string; count: number } | null> {
  let query = supabase
    .from('match_cache')
    .select('finisher, match_date')
    .not('finisher', 'is', null);

  if (startDate) query = query.gte('match_date', new Date(startDate).toISOString());
  if (endDate) query = query.lte('match_date', new Date(endDate + 'T23:59:59').toISOString());

  const { data } = await query;
  if (!data || data.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.finisher] = (counts[row.finisher] ?? 0) + 1;
  }

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? { username: top[0], count: top[1] } : null;
}

export interface AllPlayersStats {
  username: string;
  wins: number;
  kills: number;
  kd: number;
  winRate: number;
  matches: number;
}

export async function getAllPlayersStats(): Promise<AllPlayersStats[]> {
  const { data } = await supabase.from('player_match_stats').select('*');
  if (!data) return [];

  return GROUP_PLAYERS.map((username) => {
    const rows = data.filter((r) => r.player_username === username);
    if (rows.length === 0) return { username, wins: 0, kills: 0, kd: 0, winRate: 0, matches: 0 };

    const kills = rows.reduce((s, r) => s + r.kills, 0);
    const wins = rows.filter((r) => r.is_win).length;
    const matches = rows.length;
    const deaths = matches - wins;
    const kd = Math.round((deaths > 0 ? kills / deaths : kills) * 100) / 100;
    const winRate = Math.round((wins / matches) * 100);

    return { username, wins, kills, kd, winRate, matches };
  });
}

// --- Season stats (toutes saisons, données complètes) ---

export interface SeasonStats {
  username: string;
  wins: number;
  kills: number;
  assists: number;
  damage: number;
  matches: number;
  kd: number;
  winRate: number;
  avgDamage: number;
}

interface PubgSeason {
  id: string;
  isCurrent: boolean;
}

async function getAllSeasons(): Promise<PubgSeason[]> {
  const data = await fetchPUBG('/seasons');
  return data.data
    .filter((s: any) => !s.attributes.isOffseason)
    .map((s: any) => ({
      id: s.id,
      isCurrent: s.attributes.isCurrentSeason,
    }));
}

export async function syncSeasonStats(onProgress?: (msg: string) => void): Promise<void> {
  onProgress?.('Récupération de la liste des saisons...');
  const seasons = await getAllSeasons();
  await sleep(RATE_LIMIT_DELAY);

  const accountIds = await resolvePlayerIds();
  await sleep(RATE_LIMIT_DELAY);

  // Saisons déjà complètes en base (toutes les 4 joueurs présents et saison non courante)
  const { data: existingRows } = await supabase
    .from('player_season_stats')
    .select('username, season_id, is_final');

  const completedSeasons = new Set<string>();
  if (existingRows) {
    // Une saison passée est complète si tous les joueurs y ont des données
    const seasonCounts: Record<string, number> = {};
    for (const row of existingRows) {
      if (row.is_final) {
        seasonCounts[row.season_id] = (seasonCounts[row.season_id] ?? 0) + 1;
      }
    }
    for (const [seasonId, count] of Object.entries(seasonCounts)) {
      if (count >= GROUP_PLAYERS.length) completedSeasons.add(seasonId);
    }
  }

  let synced = 0;
  const total = seasons.length * GROUP_PLAYERS.length;

  for (const season of seasons) {
    // Skip les saisons passées déjà complètes
    if (!season.isCurrent && completedSeasons.has(season.id)) continue;

    for (const [username, accountId] of Object.entries(accountIds)) {
      onProgress?.(`${username} — ${season.id.replace('division.bro.official.', '')}... (${synced}/${total})`);
      try {
        const data = await fetchPUBG(`/players/${accountId}/seasons/${season.id}`);
        const fpp = data.data.attributes.gameModeStats['squad-fpp'];
        if (!fpp) { synced++; await sleep(RATE_LIMIT_DELAY); continue; }

        await supabase.from('player_season_stats').upsert({
          username,
          season_id: season.id,
          is_current: season.isCurrent,
          is_final: !season.isCurrent,
          wins: fpp.wins,
          kills: fpp.kills,
          assists: fpp.assists,
          damage: Math.round(fpp.damageDealt),
          matches: fpp.roundsPlayed,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'username,season_id' });

        synced++;
        await sleep(RATE_LIMIT_DELAY);
      } catch {
        synced++;
        await sleep(RATE_LIMIT_DELAY);
      }
    }
  }

  onProgress?.('Stats toutes saisons synchronisées !');
}

function aggregateSeasonRows(rows: any[]): SeasonStats[] {
  const byPlayer: Record<string, { wins: number; kills: number; assists: number; damage: number; matches: number }> = {};

  for (const row of rows) {
    if (!byPlayer[row.username]) {
      byPlayer[row.username] = { wins: 0, kills: 0, assists: 0, damage: 0, matches: 0 };
    }
    byPlayer[row.username].wins += row.wins;
    byPlayer[row.username].kills += row.kills;
    byPlayer[row.username].assists += row.assists;
    byPlayer[row.username].damage += row.damage;
    byPlayer[row.username].matches += row.matches;
  }

  return Object.entries(byPlayer)
    .map(([username, s]) => {
      const deaths = s.matches - s.wins;
      const kd = Math.round((deaths > 0 ? s.kills / deaths : s.kills) * 100) / 100;
      const winRate = s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0;
      const avgDamage = s.matches > 0 ? Math.round(s.damage / s.matches) : 0;
      return { username, ...s, kd, winRate, avgDamage };
    })
    .sort((a, b) => b.wins - a.wins);
}

export async function getAllTimeStats(): Promise<SeasonStats[]> {
  const { data } = await supabase.from('player_season_stats').select('*');
  if (!data || data.length === 0) return [];
  return aggregateSeasonRows(data);
}

export async function getCurrentSeasonStats(): Promise<SeasonStats[]> {
  const { data } = await supabase
    .from('player_season_stats')
    .select('*')
    .eq('is_current', true);
  if (!data || data.length === 0) return [];
  return aggregateSeasonRows(data);
}

export async function getSeasonStats(): Promise<SeasonStats[]> {
  return getAllTimeStats();
}
