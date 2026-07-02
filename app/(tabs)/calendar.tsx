import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';

LocaleConfig.locales['fr'] = {
  monthNames: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  monthNamesShort: ['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'],
  dayNames: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
  dayNamesShort: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
};
LocaleConfig.defaultLocale = 'fr';
import { Colors } from '../../constants/colors';
import { getCurrentPlayer } from '../../lib/storage';
import { GROUP_PLAYERS, getDisplayName } from '../../constants/players';
import {
  getAvailability,
  toggleAvailability,
  addNoAvailability,
  removeNoAvailability,
  deleteAvailabilityForWeek,
  getNoAvailability,
  getChosenDate,
  setChosenDate,
  PLAYER_COLORS,
  DayAvailability,
  ChosenDate,
} from '../../lib/availability';
import { SwipeableScreen } from '../../components/SwipeableScreen';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function addMonths(date: string, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

const JOURS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${JOURS_LONG[d.getDay()]} ${d.getDate()} ${MOIS_LONG[d.getMonth()]}`;
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function addDaysToStr(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function CalendarScreen() {
  const today = getToday();
  const windowEnd = addMonths(today, 3);
  const currentWeekMonday = getMondayOf(today);
  const nextWeekMonday = addDaysToStr(currentWeekMonday, 7);
  const nextWeekSunday = addDaysToStr(nextWeekMonday, 6);
  const thisWeekSunday = addDaysToStr(currentWeekMonday, 6);

  const [currentPlayer, setCurrentPlayer_] = useState<string | null>(null);
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [noAvailPlayers, setNoAvailPlayers] = useState<string[]>([]);
  const [noAvailThisWeekPlayers, setNoAvailThisWeekPlayers] = useState<string[]>([]);
  const [chosenDate, setChosenDateState] = useState<ChosenDate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showNoAvailConfirm, setShowNoAvailConfirm] = useState(false);
  const [showNoAvailThisWeekConfirm, setShowNoAvailThisWeekConfirm] = useState(false);

  useEffect(() => {
    getCurrentPlayer().then(setCurrentPlayer_);
    loadAll();
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    const weekMonday = getMondayOf(getToday());
    const [data, noAvail, noAvailThis, chosen] = await Promise.all([
      getAvailability(weekMonday, addMonths(getToday(), 3)),
      getNoAvailability(nextWeekMonday),
      getNoAvailability(weekMonday),
      getChosenDate(nextWeekMonday),
    ]);
    setAvailability(data);
    setNoAvailPlayers(noAvail);
    setNoAvailThisWeekPlayers(noAvailThis);
    setChosenDateState(chosen);
    setRefreshing(false);
  }, []);

  const handleDayPress = async (day: DateData) => {
    if (!currentPlayer) return;
    if (day.dateString < today) return;
    if (toggling) return;

    setToggling(day.dateString);

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

    await toggleAvailability(currentPlayer, day.dateString);

    // Si le joueur ajoute une dispo sur la semaine prochaine, retirer "Aucune dispo"
    if (day.dateString >= nextWeekMonday && day.dateString <= nextWeekSunday) {
      const isAdding = !availability.find((d) => d.date === day.dateString)?.players.includes(currentPlayer);
      if (isAdding && noAvailPlayers.includes(currentPlayer)) {
        setNoAvailPlayers((prev) => prev.filter((p) => p !== currentPlayer));
        await removeNoAvailability(currentPlayer, nextWeekMonday);
      }
    }

    // Si le joueur ajoute une dispo sur cette semaine, retirer "Aucune dispo"
    if (day.dateString >= currentWeekMonday && day.dateString <= thisWeekSunday) {
      const isAdding = !availability.find((d) => d.date === day.dateString)?.players.includes(currentPlayer);
      if (isAdding && noAvailThisWeekPlayers.includes(currentPlayer)) {
        setNoAvailThisWeekPlayers((prev) => prev.filter((p) => p !== currentPlayer));
        await removeNoAvailability(currentPlayer, currentWeekMonday);
      }
    }

    setToggling(null);
  };

  const handleNoAvail = async () => {
    if (!currentPlayer) return;
    const player = currentPlayer;
    const hasIt = noAvailPlayers.includes(player);

    if (hasIt) {
      setNoAvailPlayers((prev) => prev.filter((p) => p !== player));
      await removeNoAvailability(player, nextWeekMonday);
    } else {
      setShowNoAvailConfirm(true);
    }
  };

  const confirmNoAvail = async () => {
    if (!currentPlayer) return;
    const player = currentPlayer;
    setShowNoAvailConfirm(false);
    setNoAvailPlayers((prev) => [...prev, player]);
    setAvailability((prev) =>
      prev.map((d) =>
        d.date >= nextWeekMonday && d.date <= nextWeekSunday
          ? { ...d, players: d.players.filter((p) => p !== player) }
          : d
      ).filter((d) => d.players.length > 0)
    );
    await Promise.all([
      addNoAvailability(player, nextWeekMonday),
      deleteAvailabilityForWeek(player, nextWeekMonday, nextWeekSunday),
    ]);
  };

  const handleNoAvailThisWeek = async () => {
    if (!currentPlayer) return;
    const player = currentPlayer;
    const hasIt = noAvailThisWeekPlayers.includes(player);

    if (hasIt) {
      setNoAvailThisWeekPlayers((prev) => prev.filter((p) => p !== player));
      await removeNoAvailability(player, currentWeekMonday);
    } else {
      setShowNoAvailThisWeekConfirm(true);
    }
  };

  const confirmNoAvailThisWeek = async () => {
    if (!currentPlayer) return;
    const player = currentPlayer;
    setShowNoAvailThisWeekConfirm(false);
    setNoAvailThisWeekPlayers((prev) => [...prev, player]);
    setAvailability((prev) =>
      prev.map((d) =>
        d.date >= currentWeekMonday && d.date <= thisWeekSunday
          ? { ...d, players: d.players.filter((p) => p !== player) }
          : d
      ).filter((d) => d.players.length > 0)
    );
    await Promise.all([
      addNoAvailability(player, currentWeekMonday),
      deleteAvailabilityForWeek(player, currentWeekMonday, thisWeekSunday),
    ]);
  };

  const handleChooseDate = async (date: string) => {
    await setChosenDate(nextWeekMonday, date);
    setChosenDateState({ weekStart: nextWeekMonday, chosenDate: date, isManual: true });
  };

  const markedDates = useMemo(() => {
    const result: Record<string, any> = {};
    for (const day of availability) {
      const isAllFour = day.players.length >= GROUP_PLAYERS.length;
      const isMine = day.players.includes(currentPlayer ?? '');
      const isChosen = chosenDate?.chosenDate === day.date;
      result[day.date] = {
        dots: day.players.map((p) => ({
          key: p,
          color: PLAYER_COLORS[p] ?? Colors.textMuted,
          selectedDotColor: PLAYER_COLORS[p] ?? Colors.textMuted,
        })),
        marked: true,
        selected: isAllFour || isMine || isChosen,
        selectedColor: isChosen ? '#FFD700' + '55' : isAllFour ? '#4CAF5066' : Colors.primary + '33',
        selectedTextColor: Colors.text,
      };
    }
    return result;
  }, [availability, currentPlayer, chosenDate]);

  const getWeekLabel = (mondayStr: string, sundayStr: string) => {
    const mon = new Date(mondayStr + 'T12:00:00');
    const sun = new Date(sundayStr + 'T12:00:00');
    if (mon.getMonth() === sun.getMonth()) {
      return `du ${mon.getDate()} au ${sun.getDate()} ${MOIS_LONG[sun.getMonth()]}`;
    }
    return `du ${mon.getDate()} ${MOIS_LONG[mon.getMonth()]} au ${sun.getDate()} ${MOIS_LONG[sun.getMonth()]}`;
  };

  const thisWeekLabel = getWeekLabel(currentWeekMonday, thisWeekSunday);
  const nextWeekLabel = getWeekLabel(nextWeekMonday, nextWeekSunday);

  const bestThisWeek = useMemo(() => {
    return availability
      .filter((d) => d.date >= currentWeekMonday && d.date <= thisWeekSunday && d.players.length >= 2)
      .sort((a, b) => b.players.length - a.players.length || a.date.localeCompare(b.date));
  }, [availability]);

  const bestNextWeek = useMemo(() => {
    return availability
      .filter((d) => d.date >= nextWeekMonday && d.date <= nextWeekSunday && d.players.length >= 2)
      .sort((a, b) => b.players.length - a.players.length || a.date.localeCompare(b.date));
  }, [availability]);

  // Dates avec 4 votes semaine prochaine (pour sélection date retenue)
  const fourVoteDatesNextWeek = useMemo(() => {
    return bestNextWeek.filter((d) => d.players.length >= GROUP_PLAYERS.length).sort((a, b) => a.date.localeCompare(b.date));
  }, [bestNextWeek]);

  // Qui a répondu pour la semaine PROCHAINE (dispo ou aucune dispo)
  const playersWithNextWeekAvail = useMemo(() => {
    return new Set(
      availability.filter((d) => d.date >= nextWeekMonday && d.date <= nextWeekSunday).flatMap((d) => d.players)
    );
  }, [availability]);

  // Qui a répondu pour CETTE semaine (dispo ou aucune dispo)
  const playersWithThisWeekAvail = useMemo(() => {
    return new Set(
      availability.filter((d) => d.date >= currentWeekMonday && d.date <= thisWeekSunday).flatMap((d) => d.players)
    );
  }, [availability]);

  const myNoAvail = currentPlayer ? noAvailPlayers.includes(currentPlayer) : false;
  const myNoAvailThisWeek = currentPlayer ? noAvailThisWeekPlayers.includes(currentPlayer) : false;

  return (
    <SwipeableScreen>
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>DISPONIBILITÉS</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadAll} tintColor={Colors.primary} />
        }
      >
        {/* Meilleures dates cette semaine */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEILLEURES DATES CETTE SEMAINE ({thisWeekLabel})</Text>
          <View style={styles.card}>
            {bestThisWeek.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Aucune disponibilité commune pour le moment</Text>
              </View>
            ) : bestThisWeek.map((day) => {
              const isPerfect = day.players.length >= GROUP_PLAYERS.length;
              const isRetenue = chosenDate?.chosenDate === day.date;
              return (
                <View key={day.date} style={[styles.bestDateRow, isPerfect && styles.bestDateRowPerfect, isRetenue && styles.bestDateRowChosen]}>
                  <View style={styles.bestDateInfo}>
                    <View style={styles.bestDateTitleRow}>
                      {isRetenue && <Ionicons name="star" size={13} color="#FFD700" style={{ marginRight: 4 }} />}
                      <Text style={[styles.bestDateLabel, isPerfect && styles.bestDateLabelPerfect]}>
                        {formatDate(day.date)}
                      </Text>
                    </View>
                    <View style={styles.bestDateDots}>
                      {GROUP_PLAYERS.map((p) => (
                        <View key={p} style={[styles.playerDot, { backgroundColor: day.players.includes(p) ? PLAYER_COLORS[p] : Colors.backgroundSecondary, borderColor: PLAYER_COLORS[p] }]} />
                      ))}
                    </View>
                  </View>
                  {isRetenue ? (
                    <View style={styles.retenubadge}><Text style={styles.retenuBadgeText}>RETENUE</Text></View>
                  ) : isPerfect ? (
                    <View style={styles.perfectBadge}><Text style={styles.perfectBadgeText}>PARFAIT</Text></View>
                  ) : (
                    <View style={styles.countBadge}><Text style={styles.countBadgeText}>{day.players.length}/4</Text></View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Meilleures dates semaine prochaine */}
        <View style={[styles.section, { marginBottom: 16 }]}>
          <Text style={styles.sectionTitle}>MEILLEURES DATES SEMAINE PROCHAINE ({nextWeekLabel})</Text>
          <View style={styles.card}>
            {bestNextWeek.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>Aucune disponibilité commune pour le moment</Text>
              </View>
            ) : bestNextWeek.map((day) => {
              const isPerfect = day.players.length >= GROUP_PLAYERS.length;
              const isRetenue = chosenDate?.chosenDate === day.date;
              return (
                <TouchableOpacity
                  key={day.date}
                  style={[styles.bestDateRow, isPerfect && styles.bestDateRowPerfect, isRetenue && styles.bestDateRowChosen]}
                  onPress={isPerfect ? () => handleChooseDate(day.date) : undefined}
                  activeOpacity={isPerfect ? 0.7 : 1}
                >
                  <View style={styles.bestDateInfo}>
                    <View style={styles.bestDateTitleRow}>
                      {isRetenue && <Ionicons name="star" size={13} color="#FFD700" style={{ marginRight: 4 }} />}
                      <Text style={[styles.bestDateLabel, isPerfect && styles.bestDateLabelPerfect]}>
                        {formatDate(day.date)}
                      </Text>
                    </View>
                    <View style={styles.bestDateDots}>
                      {GROUP_PLAYERS.map((p) => (
                        <View key={p} style={[styles.playerDot, { backgroundColor: day.players.includes(p) ? PLAYER_COLORS[p] : Colors.backgroundSecondary, borderColor: PLAYER_COLORS[p] }]} />
                      ))}
                    </View>
                  </View>
                  {isRetenue ? (
                    <View style={styles.retenubadge}><Text style={styles.retenuBadgeText}>RETENUE</Text></View>
                  ) : isPerfect ? (
                    <View style={styles.perfectBadge}><Text style={styles.perfectBadgeText}>PARFAIT</Text></View>
                  ) : (
                    <View style={styles.countBadge}><Text style={styles.countBadgeText}>{day.players.length}/4</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
            {fourVoteDatesNextWeek.length > 1 && (
              <View style={styles.chosenHint}>
                <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.chosenHintText}>Appuie sur une date PARFAIT pour la retenir</Text>
              </View>
            )}
          </View>
        </View>

        <Calendar
          onDayPress={handleDayPress}
          markedDates={markedDates}
          markingType="multi-dot"
          minDate={today}
          maxDate={windowEnd}
          firstDay={1}
          enableSwipeMonths={false}
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
            textDayHeaderFontSize: 13,
            textDayHeaderFontWeight: '800',
            textMonthFontWeight: '800',
            textDayFontWeight: '600',
          }}
          style={styles.calendar}
        />

        {/* Légende joueurs */}
        <View style={styles.legend}>
          {GROUP_PLAYERS.map((p) => (
            <View key={p} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PLAYER_COLORS[p] }]} />
              <Text style={[styles.legendName, p === currentPlayer && styles.legendNameMe]}>{getDisplayName(p)}</Text>
            </View>
          ))}
        </View>

        {/* DISPO CETTE SEMAINE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DISPO CETTE SEMAINE ({thisWeekLabel})</Text>
          <View style={[styles.card, styles.statusGrid]}>
            {GROUP_PLAYERS.map((p) => {
              const hasNoAvail = noAvailThisWeekPlayers.includes(p);
              const hasAvail = playersWithThisWeekAvail.has(p);
              const responded = hasAvail || hasNoAvail;
              return (
                <View key={p} style={styles.statusCell}>
                  <View style={styles.statusCellLeft}>
                    <View style={[styles.statusDot, { backgroundColor: PLAYER_COLORS[p] }]} />
                    <Text style={[styles.statusName, p === currentPlayer && styles.statusNameMe]}>{getDisplayName(p)}</Text>
                  </View>
                  {responded ? (
                    <View style={[styles.respondedBadge, hasNoAvail && styles.noAvailBadge]}>
                      <Text style={[styles.respondedBadgeText, hasNoAvail && styles.noAvailBadgeText]}>
                        {hasNoAvail ? '✗ Aucune dispo' : '✓ A répondu'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.waitingText}>En attente...</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Bouton Aucune dispo cette semaine */}
          <TouchableOpacity
            style={[styles.noAvailBtn, myNoAvailThisWeek && styles.noAvailBtnActive]}
            onPress={handleNoAvailThisWeek}
          >
            <Ionicons
              name={myNoAvailThisWeek ? 'close-circle' : 'ban-outline'}
              size={18}
              color={myNoAvailThisWeek ? '#fff' : Colors.danger}
            />
            <Text style={[styles.noAvailBtnText, myNoAvailThisWeek && styles.noAvailBtnTextActive]}>
              {myNoAvailThisWeek
                ? `Annuler "Aucune dispo ${getWeekLabel(currentWeekMonday, thisWeekSunday)}"`
                : `Je ne suis pas dispo ${getWeekLabel(currentWeekMonday, thisWeekSunday)}`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* DISPO SEMAINE PROCHAINE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DISPO SEMAINE PROCHAINE ({nextWeekLabel})</Text>
          <View style={[styles.card, styles.statusGrid]}>
            {GROUP_PLAYERS.map((p) => {
              const hasNoAvail = noAvailPlayers.includes(p);
              const hasAvail = playersWithNextWeekAvail.has(p);
              const responded = hasAvail || hasNoAvail;
              return (
                <View key={p} style={styles.statusCell}>
                  <View style={styles.statusCellLeft}>
                    <View style={[styles.statusDot, { backgroundColor: PLAYER_COLORS[p] }]} />
                    <Text style={[styles.statusName, p === currentPlayer && styles.statusNameMe]}>{getDisplayName(p)}</Text>
                  </View>
                  {responded ? (
                    <View style={[styles.respondedBadge, hasNoAvail && styles.noAvailBadge]}>
                      <Text style={[styles.respondedBadgeText, hasNoAvail && styles.noAvailBadgeText]}>
                        {hasNoAvail ? '✗ Aucune dispo' : '✓ A répondu'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.waitingText}>En attente...</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Bouton Aucune dispo */}
          <TouchableOpacity
            style={[styles.noAvailBtn, myNoAvail && styles.noAvailBtnActive]}
            onPress={handleNoAvail}
          >
            <Ionicons
              name={myNoAvail ? 'close-circle' : 'ban-outline'}
              size={18}
              color={myNoAvail ? '#fff' : Colors.danger}
            />
            <Text style={[styles.noAvailBtnText, myNoAvail && styles.noAvailBtnTextActive]}>
              {myNoAvail
                ? `Annuler "Aucune dispo ${getWeekLabel(nextWeekMonday, nextWeekSunday)}"`
                : `Je ne suis pas dispo ${getWeekLabel(nextWeekMonday, nextWeekSunday)}`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
      <Modal visible={showNoAvailConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Aucune dispo cette semaine</Text>
            <Text style={styles.confirmText}>
              {`Tu confirmes ne pas être disponible du ${new Date(nextWeekMonday + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${new Date(nextWeekSunday + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} ?`}
            </Text>
            <Text style={styles.confirmSub}>Tes dispos déjà saisies sur cette semaine seront supprimées.</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowNoAvailConfirm(false)}>
                <Text style={styles.confirmCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmOk} onPress={confirmNoAvail}>
                <Text style={styles.confirmOkText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showNoAvailThisWeekConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Aucune dispo cette semaine</Text>
            <Text style={styles.confirmText}>
              {`Tu confirmes ne pas être disponible du ${new Date(currentWeekMonday + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${new Date(thisWeekSunday + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} ?`}
            </Text>
            <Text style={styles.confirmSub}>Tes dispos déjà saisies sur cette semaine seront supprimées.</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowNoAvailThisWeekConfirm(false)}>
                <Text style={styles.confirmCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmOk} onPress={confirmNoAvailThisWeek}>
                <Text style={styles.confirmOkText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </SwipeableScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
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
  calendar: {
    marginHorizontal: 12,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: Colors.primary,
    letterSpacing: 2.5, marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statusCell: {
    width: '50%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 10, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.cardBorder,
  },
  statusCellLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusName: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  statusNameMe: { color: Colors.text },
  respondedBadge: {
    backgroundColor: Colors.win + '22', borderWidth: 1, borderColor: Colors.win,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  respondedBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.win },
  noAvailBadge: { backgroundColor: Colors.danger + '22', borderColor: Colors.danger },
  noAvailBadgeText: { color: Colors.danger },
  waitingText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  noAvailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, padding: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.danger,
    backgroundColor: Colors.danger + '18',
  },
  noAvailBtnActive: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  noAvailBtnText: { fontSize: 14, fontWeight: '700', color: Colors.danger },
  noAvailBtnTextActive: { color: '#fff' },
  bestDateRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, gap: 10,
  },
  bestDateRowPerfect: { backgroundColor: '#4CAF5011' },
  bestDateRowChosen: { backgroundColor: '#FFD70011' },
  bestDateInfo: { flex: 1, gap: 6 },
  bestDateTitleRow: { flexDirection: 'row', alignItems: 'center' },
  bestDateLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  bestDateLabelPerfect: { color: Colors.win },
  bestDateDots: { flexDirection: 'row', gap: 4 },
  playerDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  perfectBadge: {
    backgroundColor: Colors.win + '22', borderWidth: 1, borderColor: Colors.win,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  perfectBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.win, letterSpacing: 0.5 },
  retenubadge: {
    backgroundColor: '#FFD700' + '33', borderWidth: 1, borderColor: '#FFD700',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  retenuBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFD700', letterSpacing: 0.5 },
  countBadge: {
    backgroundColor: Colors.primary + '22', borderWidth: 1, borderColor: Colors.primary,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  chosenHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.cardBorder,
  },
  chosenHintText: { fontSize: 12, color: Colors.textMuted },
  emptyRow: { padding: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmBox: { backgroundColor: Colors.card, borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: Colors.cardBorder },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  confirmText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  confirmSub: { fontSize: 12, color: Colors.danger, marginTop: 8, fontStyle: 'italic' },
  confirmButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancel: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center' },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  confirmOk: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: Colors.danger, alignItems: 'center' },
  confirmOkText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
