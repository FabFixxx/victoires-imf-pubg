import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';

LocaleConfig.locales['fr'] = {
  monthNames: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  monthNamesShort: ['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'],
  dayNames: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
  dayNamesShort: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
};
LocaleConfig.defaultLocale = 'fr';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import { getCurrentPlayer } from '../../lib/storage';
import { GROUP_PLAYERS } from '../../constants/players';
import {
  getAvailability,
  toggleAvailability,
  checkAllRespondedNextWeek,
  PLAYER_COLORS,
  DayAvailability,
} from '../../lib/availability';
import { notifyAllAvailabilityFilled } from '../../lib/notifications';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function addMonths(date: string, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function getWeekKey(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return `notified_week_${monday.toISOString().split('T')[0]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function CalendarScreen() {
  const today = getToday();
  const windowEnd = addMonths(today, 3);

  const [currentPlayer, setCurrentPlayer_] = useState<string | null>(null);
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    getCurrentPlayer().then(setCurrentPlayer_);
    loadAvailability();
  }, []);

  const loadAvailability = useCallback(async () => {
    setRefreshing(true);
    const data = await getAvailability(today, windowEnd);
    setAvailability(data);
    setRefreshing(false);
  }, []);

  const handleDayPress = async (day: DateData) => {
    if (!currentPlayer) return;
    if (day.dateString < today) return; // pas de modif dans le passé
    if (toggling) return;

    setToggling(day.dateString);

    // Optimistic update
    setAvailability((prev) => {
      const existing = prev.find((d) => d.date === day.dateString);
      if (existing) {
        const hasMe = existing.players.includes(currentPlayer);
        if (hasMe) {
          const newPlayers = existing.players.filter((p) => p !== currentPlayer);
          if (newPlayers.length === 0) return prev.filter((d) => d.date !== day.dateString);
          return prev.map((d) => d.date === day.dateString ? { ...d, players: newPlayers } : d);
        } else {
          return prev.map((d) => d.date === day.dateString ? { ...d, players: [...d.players, currentPlayer] } : d);
        }
      } else {
        return [...prev, { date: day.dateString, players: [currentPlayer] }];
      }
    });

    const isNowAvailable = await toggleAvailability(currentPlayer, day.dateString);

    // Si on vient d'ajouter une dispo, vérifier si tous les 4 ont répondu
    if (isNowAvailable) {
      const { allResponded, bestDates } = await checkAllRespondedNextWeek();
      if (allResponded) {
        const weekKey = getWeekKey();
        const alreadyNotified = await AsyncStorage.getItem(weekKey);
        if (!alreadyNotified) {
          await AsyncStorage.setItem(weekKey, '1');
          await notifyAllAvailabilityFilled(bestDates);
        }
      }
    }

    setToggling(null);
  };

  const markedDates = useMemo(() => {
    const result: Record<string, any> = {};
    for (const day of availability) {
      const isAllFour = day.players.length >= GROUP_PLAYERS.length;
      const isMine = day.players.includes(currentPlayer ?? '');
      result[day.date] = {
        dots: day.players.map((p) => ({
          key: p,
          color: PLAYER_COLORS[p] ?? Colors.textMuted,
          selectedDotColor: PLAYER_COLORS[p] ?? Colors.textMuted,
        })),
        marked: true,
        selected: isAllFour || isMine,
        selectedColor: isAllFour ? '#4CAF5066' : Colors.primary + '33',
        selectedTextColor: Colors.text,
      };
    }
    return result;
  }, [availability, currentPlayer]);

  const MONTHS_FR = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];

  const getWeekRange = (offsetWeeks: number) => {
    const d = new Date(today);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday + offsetWeeks * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mondayStr = monday.toISOString().split('T')[0];
    const sundayStr = sunday.toISOString().split('T')[0];
    const label = `du ${monday.getDate()} au ${sunday.getDate()} ${MONTHS_FR[sunday.getMonth()]} ${sunday.getFullYear()}`;
    return { mondayStr, sundayStr, label };
  };

  const thisWeekRange = getWeekRange(0);
  const nextWeekRange = getWeekRange(1);

  const bestThisWeek = useMemo(() => {
    const { mondayStr, sundayStr } = thisWeekRange;
    return availability
      .filter((d) => d.date >= mondayStr && d.date <= sundayStr && d.players.length >= 2)
      .sort((a, b) => b.players.length - a.players.length || a.date.localeCompare(b.date));
  }, [availability, today]);

  const bestNextWeek = useMemo(() => {
    const { mondayStr, sundayStr } = nextWeekRange;
    return availability
      .filter((d) => d.date >= mondayStr && d.date <= sundayStr && d.players.length >= 2)
      .sort((a, b) => b.players.length - a.players.length || a.date.localeCompare(b.date));
  }, [availability, today]);

  // Dispos de chaque joueur dans les 7 prochains jours
  const nextWeekEnd = addDays(today, 7);
  const nextWeekAvail = useMemo(() =>
    availability.filter((d) => d.date >= today && d.date <= nextWeekEnd),
    [availability, today, nextWeekEnd]
  );
  const playersWhoResponded = new Set(nextWeekAvail.flatMap((d) => d.players));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>DISPONIBILITÉS</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadAvailability} tintColor={Colors.primary} />
        }
      >
        {/* Meilleures dates cette semaine */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEILLEURES DATES CETTE SEMAINE ({thisWeekRange.label})</Text>
          <View style={styles.card}>
            {bestThisWeek.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Aucune disponibilité commune pour le moment</Text>
              </View>
            ) : bestThisWeek.map((day) => {
              const isPerfect = day.players.length >= GROUP_PLAYERS.length;
              return (
                <View key={day.date} style={[styles.bestDateRow, isPerfect && styles.bestDateRowPerfect]}>
                  <View style={styles.bestDateInfo}>
                    <Text style={[styles.bestDateLabel, isPerfect && styles.bestDateLabelPerfect]}>
                      {formatDate(day.date)}
                    </Text>
                    <View style={styles.bestDateDots}>
                      {GROUP_PLAYERS.map((p) => (
                        <View
                          key={p}
                          style={[
                            styles.playerDot,
                            {
                              backgroundColor: day.players.includes(p)
                                ? PLAYER_COLORS[p]
                                : Colors.backgroundSecondary,
                              borderColor: PLAYER_COLORS[p],
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  {isPerfect ? (
                    <View style={styles.perfectBadge}>
                      <Text style={styles.perfectBadgeText}>PARFAIT</Text>
                    </View>
                  ) : (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{day.players.length}/4</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Meilleures dates semaine prochaine */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEILLEURES DATES SEMAINE PROCHAINE ({nextWeekRange.label})</Text>
          <View style={styles.card}>
            {bestNextWeek.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Aucune disponibilité commune pour le moment</Text>
              </View>
            ) : bestNextWeek.map((day) => {
              const isPerfect = day.players.length >= GROUP_PLAYERS.length;
              return (
                <View key={day.date} style={[styles.bestDateRow, isPerfect && styles.bestDateRowPerfect]}>
                  <View style={styles.bestDateInfo}>
                    <Text style={[styles.bestDateLabel, isPerfect && styles.bestDateLabelPerfect]}>
                      {formatDate(day.date)}
                    </Text>
                    <View style={styles.bestDateDots}>
                      {GROUP_PLAYERS.map((p) => (
                        <View
                          key={p}
                          style={[
                            styles.playerDot,
                            {
                              backgroundColor: day.players.includes(p)
                                ? PLAYER_COLORS[p]
                                : Colors.backgroundSecondary,
                              borderColor: PLAYER_COLORS[p],
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  {isPerfect ? (
                    <View style={styles.perfectBadge}>
                      <Text style={styles.perfectBadgeText}>PARFAIT</Text>
                    </View>
                  ) : (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{day.players.length}/4</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.calendarHint}>
          <Text style={styles.calendarHintText}>
            Appuie sur un jour pour marquer ta dispo
          </Text>
        </View>

        <Calendar
          onDayPress={handleDayPress}
          markedDates={markedDates}
          markingType="multi-dot"
          minDate={today}
          maxDate={windowEnd}
          firstDay={1}
          enableSwipeMonths
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: Colors.backgroundSecondary,
            dayTextColor: Colors.text,
            textDisabledColor: Colors.textMuted,
            monthTextColor: Colors.text,
            arrowColor: Colors.primary,
            selectedDayBackgroundColor: Colors.primary,
            selectedDayTextColor: '#000',
            todayTextColor: Colors.primary,
            todayBackgroundColor: Colors.primary + '22',
            dotColor: Colors.primary,
            textSectionTitleColor: Colors.text,
            textDayHeaderFontSize: 12,
            textDayHeaderFontWeight: '800',
            textMonthFontWeight: '800',
            textDayFontSize: 13,
            textDayFontWeight: '600',
            textMonthFontSize: 14,
          }}
          style={styles.calendar}
        />

        {/* Légende joueurs */}
        <View style={styles.legend}>
          {GROUP_PLAYERS.map((p) => (
            <View key={p} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PLAYER_COLORS[p] }]} />
              <Text style={[styles.legendName, p === currentPlayer && styles.legendNameMe]}>{p}</Text>
            </View>
          ))}
        </View>

        {/* Statut réponses semaine */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CETTE SEMAINE</Text>
          <View style={[styles.card, styles.statusGrid]}>
            {GROUP_PLAYERS.map((p) => (
              <View key={p} style={styles.statusCell}>
                <View style={styles.statusCellLeft}>
                  <View style={[styles.statusDot, { backgroundColor: PLAYER_COLORS[p] }]} />
                  <Text style={[styles.statusName, p === currentPlayer && styles.statusNameMe]}>{p}</Text>
                </View>
                {playersWhoResponded.has(p) ? (
                  <View style={styles.respondedBadge}>
                    <Text style={styles.respondedBadgeText}>✓ A répondu</Text>
                  </View>
                ) : (
                  <Text style={styles.waitingText}>En attente...</Text>
                )}
              </View>
            ))}
          </View>
        </View>

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
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, letterSpacing: 3 },
  content: { flex: 1 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  legendNameMe: { color: Colors.text, fontWeight: '800' },
  calendarHint: { paddingHorizontal: 16, paddingVertical: 8 },
  calendarHintText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  calendar: {
    marginHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusCell: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  statusCellLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusName: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  statusNameMe: { color: Colors.text },
  respondedBadge: {
    backgroundColor: Colors.win + '22',
    borderWidth: 1,
    borderColor: Colors.win,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  respondedBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.win },
  waitingText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  bestDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 10,
  },
  bestDateRowPerfect: {
    backgroundColor: '#4CAF5011',
  },
  bestDateInfo: { flex: 1, gap: 6 },
  bestDateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'capitalize',
  },
  bestDateLabelPerfect: { color: Colors.win },
  bestDateDots: { flexDirection: 'row', gap: 4 },
  playerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  perfectBadge: {
    backgroundColor: Colors.win + '22',
    borderWidth: 1,
    borderColor: Colors.win,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  perfectBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.win, letterSpacing: 0.5 },
  countBadge: {
    backgroundColor: Colors.primary + '22',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  emptyRow: { padding: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },
});
