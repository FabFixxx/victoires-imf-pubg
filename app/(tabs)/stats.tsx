import { useEffect, useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { StatCard } from '../../components/StatCard';
import { SectionHeader } from '../../components/SectionHeader';
import { getPlayerStats, PlayerStats, PUBG_MAP_NAMES } from '../../lib/pubg-api';
import { supabase } from '../../lib/supabase';
import { GROUP_PLAYERS, PlayerName, getDisplayName } from '../../constants/players';
import { PLAYER_COLORS } from '../../lib/availability';
import { getCurrentPlayer } from '../../lib/storage';

interface RecentMatch {
  match_id: string;
  match_date: string;
  kills: number;
  assists: number;
  damage: number;
  win_place: number;
  is_win: boolean;
  mapName?: string;
}

export default function StatsScreen() {
  const [selected, setSelected] = useState<PlayerName>(GROUP_PLAYERS[0]);
  const [stats, setStats] = useState<Record<string, PlayerStats>>({});
  const [recent, setRecent] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPlayer = useCallback(async (username: string) => {
    setLoading(true);
    const [s, { data: recentMatches }] = await Promise.all([
      getPlayerStats(username),
      supabase
        .from('player_match_stats')
        .select('*')
        .eq('player_username', username)
        .order('match_date', { ascending: false })
        .limit(10),
    ]);
    setStats((prev) => ({ ...prev, [username]: s }));
    const sorted = (recentMatches ?? []).sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());
    const matchIds = sorted.map((m) => m.match_id);
    const { data: cacheRows } = await supabase
      .from('match_cache')
      .select('match_id, map_name')
      .in('match_id', matchIds);
    const mapNameById: Record<string, string> = {};
    for (const row of cacheRows ?? []) {
      if (row.map_name) mapNameById[row.match_id] = PUBG_MAP_NAMES[row.map_name] ?? row.map_name;
    }
    setRecent(sorted.map((m) => ({ ...m, mapName: mapNameById[m.match_id] })));
    setLoading(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    delete (stats as any)[selected];
    await loadPlayer(selected);
    setRefreshing(false);
  };

  useEffect(() => {
    getCurrentPlayer().then((player) => {
      if (player && GROUP_PLAYERS.includes(player as PlayerName)) {
        setSelected(player as PlayerName);
      }
    });
  }, []);

  useEffect(() => {
    loadPlayer(selected);
  }, [selected, loadPlayer]);

  const current = stats[selected];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>STATISTIQUES</Text>
      </View>

      {/* Player tabs */}
      <View style={styles.playerTabs}>
        {GROUP_PLAYERS.map((name) => (
          <TouchableOpacity
            key={name}
            style={[styles.tab, selected === name && styles.tabActive]}
            onPress={() => setSelected(name)}
          >
            <View style={styles.tabInner}>
              <View style={[styles.tabDot, { backgroundColor: PLAYER_COLORS[name] }]} />
              <Text style={[styles.tabText, selected === name && styles.tabTextActive]}>
                {getDisplayName(name)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : !current || current.matches === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune donnée pour {getDisplayName(selected)}</Text>
            <Text style={styles.emptyHint}>
              Lance une sync depuis l'accueil ou les réglages
            </Text>
          </View>
        ) : (
          <>
            {/* Hero card */}
            <View style={styles.heroCard}>
              <View style={[styles.heroAvatar, { borderColor: PLAYER_COLORS[selected] ?? Colors.primary, backgroundColor: (PLAYER_COLORS[selected] ?? Colors.primary) + '33' }]}>
                <Text style={[styles.heroAvatarText, { color: PLAYER_COLORS[selected] ?? Colors.primary }]}>{selected[0].toUpperCase()}</Text>
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroName}>{getDisplayName(selected)}</Text>
                <Text style={styles.heroMatches}>{current.matches} matchs FPP</Text>
              </View>
              <View style={styles.heroWins}>
                <Text style={styles.heroWinsValue}>{current.wins}</Text>
                <Text style={styles.heroWinsLabel}>victoires</Text>
              </View>
            </View>

            <SectionHeader title="Vue d'ensemble" />
            <View style={styles.row}>
              <StatCard label="Win Rate" value={`${current.winRate}%`} accent />
              <StatCard label="K/D Ratio" value={current.kd} />
            </View>

            <SectionHeader title="Combats" />
            <View style={styles.row}>
              <StatCard label="Kills totaux" value={current.kills.toLocaleString('fr-FR')} accent />
              <StatCard label="Assists totaux" value={current.assists.toLocaleString('fr-FR')} />
            </View>
            <View style={styles.row}>
              <StatCard label="Moy. kills/match" value={current.avgKills} />
              <StatCard label="Dommages totaux" value={current.damage.toLocaleString('fr-FR')} />
            </View>
            <View style={styles.row}>
              <StatCard label="Moy. dommages/match" value={current.avgDamage.toLocaleString('fr-FR')} />
            </View>

            {/* Recent matches */}
            {recent.length > 0 && (
              <>
                <SectionHeader title="Matchs récents" />
                <View style={styles.matchList}>
                  {recent.map((match) => (
                    <View key={match.match_id} style={styles.matchRow}>
                      <View
                        style={[
                          styles.matchIndicator,
                          match.is_win ? styles.matchWin : styles.matchLoss,
                        ]}
                      />
                      <View style={styles.matchInfo}>
                        <Text style={styles.matchDate}>{formatDate(match.match_date)}{match.mapName ? ` · ${match.mapName}` : ''}</Text>
                        <Text
                          style={[
                            styles.matchResult,
                            match.is_win ? styles.matchResultWin : styles.matchResultLoss,
                          ]}
                        >
                          {match.is_win ? `#1 🏆` : `#${match.win_place}`}
                        </Text>
                      </View>
                      <View style={styles.matchStats}>
                        <Text style={styles.matchKills}>
                          {match.kills}K / {match.assists}A
                        </Text>
                        <Text style={styles.matchDmg}>
                          {Math.round(match.damage).toLocaleString('fr-FR')} dmg
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 3,
  },
  playerTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    backgroundColor: Colors.card,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tabActive: {
    backgroundColor: Colors.primary + '22',
    borderColor: Colors.primary,
  },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabDot: { width: 7, height: 7, borderRadius: 3.5 },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabTextActive: { color: Colors.primary },
  content: { flex: 1, paddingHorizontal: 16 },
  empty: {
    marginTop: 60,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 16, color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  heroCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary + '33',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: { fontSize: 22, fontWeight: '900', color: Colors.primary },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 18, fontWeight: '800', color: Colors.text },
  heroMatches: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  heroWins: { alignItems: 'center' },
  heroWinsValue: { fontSize: 28, fontWeight: '900', color: Colors.primary },
  heroWinsLabel: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  matchList: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 10,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 10,
  },
  matchIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  matchWin: { backgroundColor: Colors.win },
  matchLoss: { backgroundColor: Colors.textMuted },
  matchInfo: { flex: 1 },
  matchDate: { fontSize: 12, color: Colors.textSecondary },
  matchResult: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  matchResultWin: { color: Colors.win },
  matchResultLoss: { color: Colors.textMuted },
  matchStats: { width: 110, alignItems: 'flex-end' },
  matchKills: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  matchDmg: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
