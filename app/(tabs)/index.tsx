import { useEffect, useState, useCallback } from 'react';
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
  getAllPlayersStats,
  getImfSeasonHighlights,
  getTopFinisher,
  MonthlyStats,
  LastMatch,
  AllPlayersStats,
} from '../../lib/pubg-api';
import { getLastSync, setLastSync } from '../../lib/storage';
import { getCurrentImfSeason, ImfSeason } from '../../lib/imf-seasons';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default function DashboardScreen() {
  const now = new Date();
  const [monthly, setMonthly] = useState<MonthlyStats | null>(null);
  const [imfSeason, setImfSeason] = useState<ImfSeason | null>(null);
  const [imfStats, setImfStats] = useState<MonthlyStats | null>(null);
  const [topFinisher, setTopFinisher] = useState<{ username: string; count: number } | null>(null);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [allStats, setAllStats] = useState<AllPlayersStats[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [lastSync, setLastSyncState] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const currentImfSeason = await getCurrentImfSeason();
    setImfSeason(currentImfSeason);
    const [m, lm, ls, all, imf, tf] = await Promise.all([
      getMonthlyStats(now.getFullYear(), now.getMonth() + 1),
      getLastMatch(),
      getLastSync(),
      getAllPlayersStats(),
      currentImfSeason
        ? getImfSeasonHighlights(currentImfSeason.startDate, currentImfSeason.endDate, currentImfSeason.manualWins)
        : Promise.resolve(null),
      currentImfSeason
        ? getTopFinisher(currentImfSeason.startDate, currentImfSeason.endDate)
        : Promise.resolve(null),
    ]);
    setMonthly(m);
    setLastMatch(lm);
    setLastSyncState(ls);
    setAllStats(all);
    setImfStats(imf);
    setTopFinisher(tf);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    if (syncing) return;
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

  const formatMatchDate = (date: Date) =>
    date.toLocaleDateString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });

  const isEmpty = !monthly?.totalWins && !monthly?.topFragger && !imfStats?.totalWins;

  return (
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

        {/* Monthly */}
        <SectionHeader title={`${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`} />

        <View style={styles.row}>
          <StatCard
            label="Victoires du groupe"
            value={monthly?.totalWins ?? '—'}
            accent
            large
          />
        </View>

        <View style={styles.row}>
          <StatCard
            label="Top Fragger"
            value={monthly?.topFragger?.username ?? '—'}
            subValue={monthly?.topFragger ? `${monthly.topFragger.kills} kills` : undefined}
          />
          <StatCard
            label="Top Assists"
            value={monthly?.topAssist?.username ?? '—'}
            subValue={monthly?.topAssist ? `${monthly.topAssist.assists} assists` : undefined}
          />
        </View>

        <View style={styles.row}>
          <StatCard
            label="Top Dommages"
            value={monthly?.topDamage?.username ?? '—'}
            subValue={
              monthly?.topDamage
                ? `${monthly.topDamage.damage.toLocaleString('fr-FR')} dmg`
                : undefined
            }
          />
        </View>

        {/* IMF Season */}
        {imfSeason && (
          <>
            <SectionHeader
              title={`Saison IMF ${imfSeason.year}`}
              subtitle={`Depuis le ${new Date(imfSeason.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
            />
            {/* Wins : manuel ou données réelles, sinon message */}
            {imfSeason.manualWins !== undefined || (imfStats && imfStats.totalWins > 0) ? (
              <View style={styles.row}>
                <StatCard
                  label={imfSeason.manualWins !== undefined ? 'Victoires IMF ✎' : 'Victoires IMF'}
                  value={imfStats?.totalWins ?? '—'}
                  accent
                  large
                />
              </View>
            ) : (
              <View style={styles.emptyBanner}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.emptyBannerText}>
                  Aucune donnée — synchro en cours ou renseigne les victoires manuellement dans les réglages
                </Text>
              </View>
            )}
            {/* Top stats : uniquement si données réelles disponibles */}
            {imfStats && (imfStats.topFragger || imfStats.topAssist) && (
              <>
                <View style={styles.row}>
                  <StatCard
                    label="Top Fragger IMF"
                    value={imfStats.topFragger?.username ?? '—'}
                    subValue={imfStats.topFragger ? `${imfStats.topFragger.kills} kills` : undefined}
                  />
                  <StatCard
                    label="Top Assists IMF"
                    value={imfStats.topAssist?.username ?? '—'}
                    subValue={imfStats.topAssist ? `${imfStats.topAssist.assists} assists` : undefined}
                  />
                </View>
                <View style={styles.row}>
                  <StatCard
                    label="Top Dommages IMF"
                    value={imfStats.topDamage?.username ?? '—'}
                    subValue={
                      imfStats.topDamage
                        ? `${imfStats.topDamage.damage.toLocaleString('fr-FR')} dmg`
                        : undefined
                    }
                  />
                  {topFinisher && (
                    <StatCard
                      label="Top Finisher IMF"
                      value={topFinisher.username}
                      subValue={`${topFinisher.count} dernier${topFinisher.count > 1 ? 's' : ''} kill`}
                    />
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* Season stats */}
        {/* Leaderboard */}
        {allStats.some((s) => s.matches > 0) && (
          <>
            <SectionHeader title="Classement général" />
            <View style={styles.leaderboard}>
              {[...allStats]
                .sort((a, b) => b.wins - a.wins)
                .map((s, idx) => (
                  <View key={s.username} style={styles.leaderRow}>
                    <Text style={[styles.rank, idx === 0 && styles.rankGold]}>
                      {idx === 0 ? '🏆' : `#${idx + 1}`}
                    </Text>
                    <View style={styles.leaderAvatar}>
                      <Text style={styles.leaderAvatarText}>
                        {s.username[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.leaderName}>{s.username}</Text>
                    <View style={styles.leaderStats}>
                      <Text style={styles.leaderWins}>{s.wins}W</Text>
                      <Text style={styles.leaderKd}>K/D {s.kd}</Text>
                      <Text style={styles.leaderWr}>{s.winRate}%</Text>
                    </View>
                  </View>
                ))}
            </View>
          </>
        )}

        {/* Last match */}
        {lastMatch && (
          <>
            <SectionHeader title="Dernier match" />
            <View
              style={[
                styles.lastMatchCard,
                lastMatch.isWin && styles.lastMatchWin,
              ]}
            >
              <View style={styles.lastMatchHeader}>
                <Text style={styles.lastMatchDate}>
                  {formatMatchDate(lastMatch.matchDate)}
                </Text>
                <View
                  style={[
                    styles.resultBadge,
                    lastMatch.isWin ? styles.winBadge : styles.lossBadge,
                  ]}
                >
                  <Text style={styles.resultBadgeText}>
                    {lastMatch.isWin ? '🏆 VICTOIRE' : 'DÉFAITE'}
                  </Text>
                </View>
              </View>
              {lastMatch.isWin && lastMatch.finisher && (
                <View style={styles.finisherRow}>
                  <Ionicons name="skull-outline" size={14} color={Colors.win} />
                  <Text style={styles.finisherText}>
                    Dernier kill : <Text style={styles.finisherName}>{lastMatch.finisher}</Text>
                  </Text>
                </View>
              )}
              <View style={styles.playersGrid}>
                {lastMatch.players.map((p) => (
                  <View key={p.username} style={styles.playerStat}>
                    <Text style={styles.playerStatName}>{p.username}</Text>
                    <Text style={styles.playerStatKills}>
                      {p.kills}K / {p.assists}A
                    </Text>
                    <Text style={styles.playerStatDmg}>
                      {p.damage.toLocaleString('fr-FR')} dmg
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
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
  leaderboard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 10,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  rank: {
    width: 28,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  rankGold: { color: Colors.primary },
  leaderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderAvatarText: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  leaderName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  leaderStats: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  leaderWins: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  leaderKd: { fontSize: 12, color: Colors.textSecondary },
  leaderWr: { fontSize: 11, color: Colors.textMuted },
  lastMatchCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
  },
  lastMatchWin: { borderColor: Colors.win },
  lastMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  lastMatchDate: { fontSize: 12, color: Colors.textSecondary, textTransform: 'capitalize' },
  resultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  winBadge: {
    backgroundColor: Colors.win + '22',
    borderWidth: 1,
    borderColor: Colors.win,
  },
  lossBadge: { backgroundColor: Colors.cardBorder },
  resultBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  finisherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.win + '44',
  },
  finisherText: { fontSize: 12, color: Colors.textSecondary },
  finisherName: { fontWeight: '800', color: Colors.win },
  playerStat: { flex: 1, minWidth: '40%' },
  playerStatName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  playerStatKills: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  playerStatDmg: { fontSize: 11, color: Colors.textMuted },
});
