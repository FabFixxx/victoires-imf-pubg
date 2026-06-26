import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { StatCard } from '../../components/StatCard';
import { SectionHeader } from '../../components/SectionHeader';
import {
  syncData,
  getMonthlyStats,
  getLastMatch,
  getImfSeasonHighlights,
  getFinisherStats,
  getTopMaps,
  getLastWin,
  PUBG_MAP_NAMES,
  MonthlyStats,
  LastMatch,
} from '../../lib/pubg-api';
import { getLastSync, setLastSync } from '../../lib/storage';
import { GROUP_PLAYERS, getDisplayName } from '../../constants/players';
import { PLAYER_COLORS } from '../../lib/availability';
import { getCurrentImfSeason, ImfSeason } from '../../lib/imf-seasons';
import { supabase } from '../../lib/supabase';
import { SwipeableScreen } from '../../components/SwipeableScreen';

interface TeamMatch {
  match_id: string;
  match_date: string;
  win_place: number;
  is_win: boolean;
  kills: number;
  assists: number;
  damage: number;
  mapName?: string;
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function avg(total: number, matches: number): string {
  if (matches === 0) return '—';
  return (total / matches).toFixed(1);
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function MatchCard({ match, title }: { match: LastMatch; title: string }) {
  const formatDate = (date: Date) => {
    const weekday = JOURS[date.getDay()];
    const day = date.getDate();
    const month = MOIS[date.getMonth()];
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${weekday} ${day} ${month} ${h}:${m}`;
  };

  const totalKills = match.players.reduce((s, p) => s + p.kills, 0);
  const totalAssists = match.players.reduce((s, p) => s + p.assists, 0);
  const totalDmg = match.players.reduce((s, p) => s + p.damage, 0);

  return (
    <>
      <SectionHeader title={title} />
      <View style={[styles.matchCard, match.isWin && styles.matchCardWin]}>
        <View style={styles.matchCardHeader}>
          <View>
            <Text style={styles.matchDate}>
                {formatDate(match.matchDate)}{match.mapName ? ` · ${match.mapName}` : ''}
              </Text>
            {match.isWin && match.finisher && (
              <View style={styles.finisherInline}>
                <Ionicons name="skull-outline" size={12} color={Colors.win} />
                <Text style={styles.finisherText}>
                  Dernier kill : <Text style={styles.finisherName}>{match.finisher}</Text>
                </Text>
              </View>
            )}
          </View>
          <View style={styles.teamTotals}>
            <Text style={styles.teamTotalsKA}>{totalKills}K / {totalAssists}A</Text>
            <Text style={styles.teamTotalsDmg}>{Math.round(totalDmg).toLocaleString('fr-FR')} dmg</Text>
          </View>
          <View style={[styles.badge, match.isWin ? styles.badgeWin : styles.badgeLoss]}>
            <Text style={styles.badgeText}>
              {match.isWin
                ? '🏆 VICTOIRE'
                : match.placement && match.totalTeams
                  ? `#${match.placement}/${match.totalTeams}`
                  : 'DÉFAITE'}
            </Text>
          </View>
        </View>
        <View style={styles.playersGrid}>
          {[...match.players].sort((a, b) => GROUP_PLAYERS.indexOf(a.username as any) - GROUP_PLAYERS.indexOf(b.username as any)).map((p) => (
            <View key={p.username} style={styles.playerStat}>
              <View style={styles.playerNameRow}>
                <View style={[styles.playerDot, { backgroundColor: PLAYER_COLORS[p.username] ?? Colors.textMuted }]} />
                <Text style={styles.playerName}>{getDisplayName(p.username)}</Text>
              </View>
              <Text style={styles.playerKills}>{p.kills}K / {p.assists}A</Text>
              <Text style={styles.playerDmg}>{p.damage.toLocaleString('fr-FR')} dmg</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

export default function DashboardScreen() {
  const now = new Date();
  const [monthly, setMonthly] = useState<MonthlyStats | null>(null);
  const [imfSeason, setImfSeason] = useState<ImfSeason | null>(null);
  const [imfStats, setImfStats] = useState<MonthlyStats | null>(null);
  const [finisherStats, setFinisherStats] = useState<{ username: string; count: number }[]>([]);
  const [topMaps, setTopMaps] = useState<{ mapName: string; wins: number }[]>([]);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [lastWin, setLastWin] = useState<LastMatch | null>(null);
  const [recentTeamMatches, setRecentTeamMatches] = useState<TeamMatch[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [lastSync, setLastSyncState] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const currentImfSeason = await getCurrentImfSeason();
    setImfSeason(currentImfSeason);
    const [m, lm, lw, ls, imf, fs, maps] = await Promise.all([
      getMonthlyStats(now.getFullYear(), now.getMonth() + 1),
      getLastMatch(),
      getLastWin(),
      getLastSync(),
      currentImfSeason
        ? getImfSeasonHighlights(currentImfSeason.startDate, currentImfSeason.endDate, currentImfSeason.manualWinsDetail.length || undefined)
        : Promise.resolve(null),
      currentImfSeason
        ? getFinisherStats(currentImfSeason.startDate, currentImfSeason.endDate, currentImfSeason.manualWinsDetail)
        : Promise.resolve([]),
      currentImfSeason
        ? getTopMaps(currentImfSeason.startDate, currentImfSeason.endDate, currentImfSeason.manualWinsDetail)
        : Promise.resolve([]),
    ]);
    setMonthly(m);
    setLastMatch(lm);
    setLastWin(lw);
    setLastSyncState(ls);
    setImfStats(imf);
    setFinisherStats(fs);
    setTopMaps(maps);

    const { data: rawMatches } = await supabase
      .from('player_match_stats')
      .select('match_id, match_date, kills, assists, damage, win_place, is_win')
      .in('player_username', GROUP_PLAYERS as unknown as string[])
      .order('match_date', { ascending: false })
      .limit(40);

    const matchMap = new Map<string, TeamMatch>();
    for (const row of rawMatches ?? []) {
      if (!matchMap.has(row.match_id)) {
        matchMap.set(row.match_id, {
          match_id: row.match_id,
          match_date: row.match_date,
          win_place: row.win_place,
          is_win: row.is_win,
          kills: 0, assists: 0, damage: 0,
        });
      }
      const m2 = matchMap.get(row.match_id)!;
      m2.kills += row.kills;
      m2.assists += row.assists;
      m2.damage += row.damage;
    }
    const matchIds = Array.from(matchMap.keys());
    const { data: cacheRows } = await supabase
      .from('match_cache')
      .select('match_id, map_name')
      .in('match_id', matchIds);
    const mapNameById: Record<string, string> = {};
    for (const row of cacheRows ?? []) {
      if (row.map_name) mapNameById[row.match_id] = PUBG_MAP_NAMES[row.map_name] ?? row.map_name;
    }
    const sorted = Array.from(matchMap.values())
      .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())
      .slice(0, 10)
      .map((m) => ({ ...m, mapName: mapNameById[m.match_id] }));
    setRecentTeamMatches(sorted);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncMsg('Démarrage...');
    try {
      await syncData((msg) => setSyncMsg(msg));
      const now_ = new Date();
      await setLastSync(now_);
      setLastSyncState(now_);
    } catch {
      setSyncMsg('Erreur de synchronisation');
    }
    await loadData();
    syncingRef.current = false;
    setSyncing(false);
    setSyncMsg('');
  };

  const formatSyncTime = (date: Date | null) => {
    if (!date) return 'Jamais synchronisé';
    const diff = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diff < 1) return "À l'instant";
    if (diff < 60) return `Il y a ${diff} min`;
    if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`;
    return `Il y a ${Math.floor(diff / 1440)}j`;
  };

  const isEmpty = !monthly?.totalWins && !imfStats?.totalWins;

  return (
    <SwipeableScreen>
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={loading && !syncing}
            onRefresh={loadData}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>VICTOIRES IMF</Text>
            <Text style={styles.appTitleAccent}>PUBG</Text>
          </View>
          <TouchableOpacity
            style={[styles.syncBtn, syncing && styles.syncBtnActive]}
            onPress={handleSync}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.syncStatus}>
          {syncing ? syncMsg : formatSyncTime(lastSync)}
        </Text>

        {isEmpty && !loading && (
          <View style={styles.emptyBanner}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.emptyBannerText}>
              Appuie sur ↻ pour synchroniser les données PUBG
            </Text>
          </View>
        )}

        {/* ── Mois en cours ── */}
        <SectionHeader title={`${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`} />

        <View style={styles.row}>
          <StatCard label="Victoires du groupe" value={monthly?.totalWins ?? '—'} accent large />
        </View>

        <View style={styles.statsBar}>
          <View style={styles.statsBarItem}>
            <Text style={styles.statsBarLabel}>Matchs</Text>
            <Text style={styles.statsBarValue}>{monthly?.totalMatches ?? '—'}</Text>
          </View>
          <View style={styles.statsBarDivider} />
          <View style={styles.statsBarItem}>
            <Text style={styles.statsBarLabel}>Frags moy.</Text>
            <Text style={styles.statsBarValue}>{monthly ? avg(monthly.totalKills, monthly.totalMatches) : '—'}</Text>
          </View>
          <View style={styles.statsBarDivider} />
          <View style={styles.statsBarItem}>
            <Text style={styles.statsBarLabel}>Dmg moy.</Text>
            <Text style={styles.statsBarValue}>{monthly ? avg(monthly.totalDamage, monthly.totalMatches) : '—'}</Text>
          </View>
        </View>

        {/* ── Saison IMF ── */}
        {imfSeason && (
          <>
            <SectionHeader
              title={`Saison IMF ${imfSeason.year}`}
              subtitle={`Depuis le ${new Date(imfSeason.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
            />

            {imfSeason.manualWinsDetail.length > 0 || (imfStats && imfStats.totalWins > 0) ? (
              <View style={styles.row}>
                <StatCard
                  label="Victoires IMF"
                  value={imfStats?.totalWins ?? '—'}
                  accent
                  large
                />
              </View>
            ) : (
              <View style={styles.emptyBanner}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.emptyBannerText}>
                  Aucune donnée — synchro en cours ou renseigne les victoires dans les réglages
                </Text>
              </View>
            )}

            <View style={styles.statsBar}>
              <View style={styles.statsBarItem}>
                <Text style={styles.statsBarLabel}>Matchs</Text>
                <Text style={styles.statsBarValue}>{imfStats?.totalMatches ?? '—'}</Text>
              </View>
              <View style={styles.statsBarDivider} />
              <View style={styles.statsBarItem}>
                <Text style={styles.statsBarLabel}>Frags moy.</Text>
                <Text style={styles.statsBarValue}>{imfStats ? avg(imfStats.totalKills, imfStats.totalMatches) : '—'}</Text>
              </View>
              <View style={styles.statsBarDivider} />
              <View style={styles.statsBarItem}>
                <Text style={styles.statsBarLabel}>Dmg moy.</Text>
                <Text style={styles.statsBarValue}>{imfStats ? avg(imfStats.totalDamage, imfStats.totalMatches) : '—'}</Text>
              </View>
            </View>

            {/* Top 5 cartes */}
            <Text style={styles.listTitle}>TOP CARTES GAGNÉES</Text>
            <View style={styles.listCard}>
              {topMaps.length === 0 ? (
                <View style={styles.listRow}>
                  <Text style={styles.listEmpty}>Aucune donnée — synchro requise</Text>
                </View>
              ) : (
                topMaps.map((m, idx) => (
                  <View key={m.mapName} style={[styles.listRow, idx < topMaps.length - 1 && styles.listRowBorder]}>
                    <Text style={styles.listRank}>#{idx + 1}</Text>
                    <Text style={styles.listLabel}>{m.mapName}</Text>
                    <Text style={styles.listValue}>
                      {m.wins} victoire{m.wins > 1 ? 's' : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* Top Finisher — 4 joueurs */}
            <Text style={styles.listTitle}>TOP FINISHER</Text>
            <View style={styles.listCard}>
              {finisherStats.length === 0 ? (
                <View style={styles.listRow}>
                  <Text style={styles.listEmpty}>Aucune donnée — synchro requise</Text>
                </View>
              ) : (
                finisherStats.map((f, idx) => (
                  <View key={f.username} style={[styles.listRow, idx < finisherStats.length - 1 && styles.listRowBorder]}>
                    <Text style={[styles.listRank, idx === 0 && f.count > 0 && styles.listRankGold]}>
                      {idx === 0 && f.count > 0 ? '🏆' : `#${idx + 1}`}
                    </Text>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[styles.playerDot, { backgroundColor: PLAYER_COLORS[f.username] ?? Colors.textMuted }]} />
                      <Text style={styles.listLabel}>{getDisplayName(f.username)}</Text>
                    </View>
                    <View style={styles.listValueWrap}>
                      <Ionicons name="skull-outline" size={12} color={f.count > 0 ? Colors.win : Colors.textMuted} />
                      <Text style={[styles.listValue, f.count === 0 && styles.listValueMuted]}>
                        {f.count} dernier{f.count > 1 ? 's' : ''} kill
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* ── Dernier match ── */}
        {lastMatch && <MatchCard match={lastMatch} title="Dernier match" />}

        {/* ── Dernière victoire ── */}
        {lastWin && <MatchCard match={lastWin} title="Dernière victoire" />}

        {/* ── Matchs récents IMF ── */}
        {recentTeamMatches.length > 0 && (
          <>
            <SectionHeader title="Matchs récents IMF" />
            <View style={styles.matchList}>
              {recentTeamMatches.map((match) => (
                <View key={match.match_id} style={styles.teamMatchRow}>
                  <View style={[styles.teamMatchIndicator, match.is_win ? styles.teamMatchWin : styles.teamMatchLoss]} />
                  <View style={styles.teamMatchInfo}>
                    <Text style={styles.teamMatchDate}>
                      {(() => { const d = new Date(match.match_date); const h = String(d.getHours()).padStart(2, '0'); const m = String(d.getMinutes()).padStart(2, '0'); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${h}:${m}`; })()}
                      {match.mapName ? ` · ${match.mapName}` : ''}
                    </Text>
                    <Text style={[styles.teamMatchResult, match.is_win ? styles.teamMatchResultWin : styles.teamMatchResultLoss]}>
                      {match.is_win ? '#1 🏆' : `#${match.win_place}`}
                    </Text>
                  </View>
                  <View style={styles.teamMatchStats}>
                    <Text style={styles.teamMatchKills}>{match.kills}K / {match.assists}A</Text>
                    <Text style={styles.teamMatchDmg}>{Math.round(match.damage).toLocaleString('fr-FR')} dmg</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
    </SwipeableScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 4,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 3,
  },
  appTitleAccent: {
    fontSize: 38,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 6,
    lineHeight: 40,
  },
  syncBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  syncStatus: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  emptyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  emptyBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.secondary,
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
  },
  statsBarItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  statsBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  statsBarValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  statsBarDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 8,
  },
  listTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: Colors.textMuted,
    marginBottom: 6,
    marginTop: 2,
  },
  listCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  listRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  listRank: {
    width: 26,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  listRankGold: { color: Colors.primary },
  listLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  listValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  listValueMuted: {
    color: Colors.textMuted,
    fontWeight: '500',
  },
  listEmpty: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  matchCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
  },
  matchCardWin: { borderColor: Colors.win },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  matchDate: { fontSize: 12, color: Colors.textSecondary },
  matchMap: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeWin: {
    backgroundColor: Colors.win + '22',
    borderWidth: 1,
    borderColor: Colors.win,
  },
  badgeLoss: { backgroundColor: Colors.cardBorder },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
  teamTotals: {
    alignItems: 'center',
    flex: 1,
  },
  teamTotalsKA: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  teamTotalsDmg: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  finisherInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  finisherText: { fontSize: 12, color: Colors.textSecondary },
  finisherName: { fontWeight: '800', color: Colors.win },
  matchList: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 10,
  },
  teamMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 10,
  },
  teamMatchIndicator: { width: 4, height: 36, borderRadius: 2 },
  teamMatchWin: { backgroundColor: Colors.win },
  teamMatchLoss: { backgroundColor: Colors.textMuted },
  teamMatchInfo: { flex: 1 },
  teamMatchDate: { fontSize: 12, color: Colors.textSecondary },
  teamMatchResult: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  teamMatchResultWin: { color: Colors.win },
  teamMatchResultLoss: { color: Colors.textMuted },
  teamMatchStats: { width: 110, alignItems: 'flex-end' },
  teamMatchKills: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  teamMatchDmg: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  playersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  playerStat: { flex: 1, minWidth: '40%' },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  playerDot: { width: 8, height: 8, borderRadius: 4 },
  playerName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  playerKills: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  playerDmg: { fontSize: 11, color: Colors.textMuted },
});
