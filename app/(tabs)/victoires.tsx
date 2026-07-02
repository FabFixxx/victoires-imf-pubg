import { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { PUBG_MAP_NAMES } from '../../lib/pubg-api';
import { supabase } from '../../lib/supabase';
import { getImfSeasons, ImfSeason } from '../../lib/imf-seasons';
import { GROUP_PLAYERS, getDisplayName } from '../../constants/players';
import { PLAYER_COLORS } from '../../lib/availability';

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} · ${h}h${m}`;
}

function formatSeasonDates(start: string, end: string, isCurrent: boolean): string {
  return `${formatDate(start)} → ${isCurrent ? "aujourd'hui" : formatDate(end)}`;
}

function toDateStr(iso: string): string {
  return iso.slice(0, 10);
}

interface WinPlayer {
  username: string;
  kills: number;
  assists: number;
  damage: number;
}

interface Victory {
  key: string;
  matchDate: string | null;
  mapName: string | null;
  finisher: string | null;
  totalTeams: number | null;
  players: WinPlayer[];
  isManual: boolean;
}

async function getVictoriesForSeason(year: number, startDate: string, endDate: string): Promise<Victory[]> {
  const start = new Date(startDate).toISOString();
  const end = new Date(endDate + 'T23:59:59').toISOString();

  // PUBG victories from match cache
  const { data: statsRows } = await supabase
    .from('player_match_stats')
    .select('match_id, match_date, kills, assists, damage, player_username')
    .eq('is_win', true)
    .gte('match_date', start)
    .lte('match_date', end)
    .in('player_username', GROUP_PLAYERS as unknown as string[]);

  const matchIds = [...new Set((statsRows ?? []).map((r) => r.match_id))];

  const { data: cacheRows } = await supabase
    .from('match_cache')
    .select('match_id, map_name, finisher, data')
    .in('match_id', matchIds.length ? matchIds : ['__none__']);

  const cacheByMatchId: Record<string, { mapName: string | null; finisher: string | null; totalTeams: number | null }> = {};
  for (const row of cacheRows ?? []) {
    const allPlayers: { winPlace?: number }[] = row.data?.players ?? [];
    const totalTeams = allPlayers.length > 0 ? Math.max(...allPlayers.map((p) => p.winPlace ?? 1)) : null;
    cacheByMatchId[row.match_id] = {
      mapName: row.map_name ? (PUBG_MAP_NAMES[row.map_name] ?? row.map_name) : null,
      finisher: row.finisher ?? null,
      totalTeams,
    };
  }

  const byMatch: Record<string, { matchDate: string; players: WinPlayer[] }> = {};
  for (const row of statsRows ?? []) {
    if (!byMatch[row.match_id]) byMatch[row.match_id] = { matchDate: row.match_date, players: [] };
    byMatch[row.match_id].players.push({
      username: row.player_username,
      kills: row.kills,
      assists: row.assists,
      damage: Math.round(row.damage),
    });
  }

  const pubgVictories: Victory[] = matchIds
    .map((matchId) => {
      const match = byMatch[matchId];
      if (!match) return null;
      const cache = cacheByMatchId[matchId] ?? { mapName: null, finisher: null, totalTeams: null };
      const players = [...match.players].sort(
        (a, b) => GROUP_PLAYERS.indexOf(a.username as any) - GROUP_PLAYERS.indexOf(b.username as any)
      );
      return {
        key: matchId,
        matchDate: match.matchDate,
        mapName: cache.mapName,
        finisher: cache.finisher,
        totalTeams: cache.totalTeams,
        players,
        isManual: false,
      };
    })
    .filter(Boolean) as Victory[];

  // Dates already covered by PUBG victories
  const coveredDates = new Set(pubgVictories.map((v) => toDateStr(v.matchDate!)));

  // Manual wins from imf_season_wins not already covered
  const { data: manualRows } = await supabase
    .from('imf_season_wins')
    .select('id, map_name, finisher, win_date')
    .eq('year', year);

  const manualVictories: Victory[] = (manualRows ?? [])
    .filter((w) => {
      if (!w.win_date) return true; // no date → always include (can't deduplicate)
      return !coveredDates.has(toDateStr(w.win_date));
    })
    .map((w) => ({
      key: `manual_${w.id}`,
      matchDate: w.win_date ?? null,
      mapName: w.map_name ? (PUBG_MAP_NAMES[w.map_name] ?? w.map_name) : null,
      finisher: w.finisher ?? null,
      totalTeams: null,
      players: [],
      isManual: true,
    }));

  const all = [...pubgVictories, ...manualVictories];
  all.sort((a, b) => {
    if (!a.matchDate) return 1;
    if (!b.matchDate) return -1;
    return new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime();
  });
  return all;
}

function VictoryCard({ index, total, win }: { index: number; total: number; win: Victory }) {
  return (
    <View style={[styles.card, win.isManual && styles.cardManual]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.victoryNumRow}>
            <Text style={styles.victoryNum}>#{total - index} 🏆</Text>
            {win.isManual && (
              <View style={styles.manualBadge}>
                <Text style={styles.manualBadgeText}>saisie manuelle</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardDate}>
            {win.matchDate ? formatDateTime(win.matchDate) : 'Date inconnue'}
          </Text>
        </View>
        <View style={styles.cardHeaderRight}>
          {win.mapName && (
            <View style={styles.mapBadge}>
              <Text style={styles.mapBadgeText}>{win.mapName}</Text>
            </View>
          )}
          {win.totalTeams != null && (
            <Text style={styles.teamsCount}>{win.totalTeams} équipes</Text>
          )}
        </View>
      </View>

      {win.finisher && (
        <View style={styles.finisherRow}>
          <Ionicons name="skull-outline" size={12} color={win.finisher === 'Zone bleue' ? Colors.blueZone : Colors.win} style={{ marginTop: 1 }} />
          <Text style={styles.finisherText}>
            Dernier kill : <Text style={[styles.finisherName, win.finisher === 'Zone bleue' && { color: Colors.blueZone }]}>{win.finisher}</Text>
          </Text>
        </View>
      )}

      {win.players.length > 0 && (
        <>
          <View style={styles.divider} />
          <View style={styles.playersTable}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableCellPlayer, styles.tableHeaderText]}>Joueur</Text>
              <Text style={[styles.tableCell, styles.tableCellStat, styles.tableHeaderText]}>Kills</Text>
              <Text style={[styles.tableCell, styles.tableCellStat, styles.tableHeaderText]}>Assists</Text>
              <Text style={[styles.tableCell, styles.tableCellDmg, styles.tableHeaderText]}>Dommages</Text>
            </View>
            {win.players.map((p) => (
              <View key={p.username} style={styles.tableRow}>
                <View style={[styles.tableCell, styles.tableCellPlayer, styles.playerCell]}>
                  <View style={[styles.playerDot, { backgroundColor: PLAYER_COLORS[p.username] ?? Colors.textMuted }]} />
                  <Text style={styles.tableCellPlayerValue}>{getDisplayName(p.username)}</Text>
                </View>
                <Text style={[styles.tableCell, styles.tableCellStat, styles.tableCellValue]}>{p.kills}</Text>
                <Text style={[styles.tableCell, styles.tableCellStat, styles.tableCellValue]}>{p.assists}</Text>
                <Text style={[styles.tableCell, styles.tableCellDmg, styles.tableCellValue]}>{p.damage.toLocaleString('fr-FR')}</Text>
              </View>
            ))}
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableCellPlayer, styles.tableCellTotal]}>Total</Text>
              <Text style={[styles.tableCell, styles.tableCellStat, styles.tableCellTotal]}>
                {win.players.reduce((s, p) => s + p.kills, 0)}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellStat, styles.tableCellTotal]}>
                {win.players.reduce((s, p) => s + p.assists, 0)}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellDmg, styles.tableCellTotal]}>
                {win.players.reduce((s, p) => s + p.damage, 0).toLocaleString('fr-FR')}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export default function VictoiresScreen() {
  const [seasons, setSeasons] = useState<ImfSeason[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [victories, setVictories] = useState<Victory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentSeason = seasons.find((s) => s.year === selectedYear) ?? null;

  const loadVictories = useCallback(async (season: ImfSeason) => {
    setLoading(true);
    const wins = await getVictoriesForSeason(season.year, season.startDate, season.endDate);
    setVictories(wins);
    setLoading(false);
  }, []);

  useEffect(() => {
    getImfSeasons().then((list) => {
      setSeasons(list);
      const current = list.find((s) => s.isCurrent) ?? list[0];
      if (current) {
        setSelectedYear(current.year);
        loadVictories(current);
      } else {
        setLoading(false);
      }
    });
  }, [loadVictories]);

  const handleSelectYear = (year: number) => {
    if (year === selectedYear) return;
    setSelectedYear(year);
    const season = seasons.find((s) => s.year === year);
    if (season) loadVictories(season);
  };

  const handleRefresh = async () => {
    if (!currentSeason) return;
    setRefreshing(true);
    await loadVictories(currentSeason);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>VICTOIRES IMF</Text>
      </View>

      <View style={styles.seasonPicker}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonPickerContent}>
          {seasons.map((s) => (
            <TouchableOpacity
              key={s.year}
              onPress={() => handleSelectYear(s.year)}
              style={[styles.seasonTab, selectedYear === s.year && styles.seasonTabActive]}
            >
              <Text style={[styles.seasonTabText, selectedYear === s.year && styles.seasonTabTextActive]}>
                {s.year}
              </Text>
              {s.isCurrent && <View style={styles.currentDot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {currentSeason && (
        <View style={styles.seasonInfo}>
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.seasonDates}>
            {formatSeasonDates(currentSeason.startDate, currentSeason.endDate, currentSeason.isCurrent)}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
        ) : victories.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune victoire pour cette saison</Text>
          </View>
        ) : (
          <>
            <View style={styles.countRow}>
              <Text style={styles.countText}>{victories.length} victoire{victories.length > 1 ? 's' : ''}</Text>
            </View>
            {[...victories].reverse().map((win, i) => (
              <VictoryCard key={win.key} index={i} total={victories.length} win={win} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, letterSpacing: 3 },

  seasonPicker: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  seasonPickerContent: { paddingHorizontal: 12, gap: 4, paddingVertical: 8 },
  seasonTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  seasonTabActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  seasonTabText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  seasonTabTextActive: { color: Colors.primary },
  currentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.win },

  seasonInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.backgroundSecondary,
  },
  seasonDates: { fontSize: 11, color: Colors.textMuted },

  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 10, paddingBottom: 32 },

  countRow: { alignItems: 'flex-end', paddingHorizontal: 4, paddingBottom: 4 },
  countText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  empty: { flex: 1, alignItems: 'center', marginTop: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  cardManual: { borderColor: Colors.textMuted + '44' },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 12,
    paddingBottom: 8,
  },
  cardHeaderLeft: { gap: 3, flex: 1 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 4 },

  victoryNumRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  victoryNum: { fontSize: 18, fontWeight: '900', color: Colors.win },
  manualBadge: {
    backgroundColor: Colors.textMuted + '22',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.textMuted + '44',
  },
  manualBadgeText: { fontSize: 9, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  cardDate: { fontSize: 11, color: Colors.textMuted },

  mapBadge: {
    backgroundColor: Colors.primary + '22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
  },
  mapBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  teamsCount: { fontSize: 10, color: Colors.textMuted },

  finisherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  finisherText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  finisherName: { fontWeight: '800', color: Colors.win },

  divider: { height: 1, backgroundColor: Colors.cardBorder },

  playersTable: { padding: 10, gap: 2 },
  tableHeader: { flexDirection: 'row', paddingBottom: 4 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  tableCell: { fontSize: 12 },
  tableCellPlayer: { flex: 2 },
  tableCellStat: { flex: 1, textAlign: 'center' },
  tableCellDmg: { flex: 1.5, textAlign: 'right' },
  playerCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerDot: { width: 7, height: 7, borderRadius: 3.5 },
  tableCellPlayerValue: { color: Colors.text, fontWeight: '600', fontSize: 12 },
  tableCellValue: { color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  tableCellTotal: { color: Colors.primary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tableHeaderText: { fontSize: 10, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
});
