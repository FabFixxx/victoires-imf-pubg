import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTheme, ThemeMode } from '../../lib/theme';
import type { ColorScheme } from '../../constants/colors';
import { SectionHeader } from '../../components/SectionHeader';
import { getCurrentPlayer, setCurrentPlayer } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { PUBG_MAPS, getLastServerSync } from '../../lib/pubg-api';
import { registerPushToken } from '../../lib/notifications';
import {
  getImfSeasons, upsertImfSeason,
  addManualWin, updateManualWin, deleteManualWin,
  ImfSeason, ManualWin,
} from '../../lib/imf-seasons';
import { GROUP_PLAYERS, getDisplayName } from '../../constants/players';
import { CHANGELOG } from '../../constants/changelog';
import { PLAYER_COLORS, getNotificationPrefs, saveNotificationPrefs, NotificationPrefs } from '../../lib/availability';
import { SwipeableScreen } from '../../components/SwipeableScreen';

const TRACKER_BASE = 'https://tracker.gg/pubg/profile/steam';

type SyncLogEntry = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  matches_new: number;
  matches_saved: number;
  error_msg: string | null;
  triggered_by: string;
};

// Converts YYYY-MM-DD (ISO/DB) to DD/MM/YYYY (display)
const toDisplayDate = (iso: string) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Converts DD/MM/YYYY (user input) to YYYY-MM-DD (ISO/DB)
const toIsoDate = (display: string) => {
  if (!display || !/^\d{2}\/\d{2}\/\d{4}$/.test(display)) return display;
  const [d, m, y] = display.split('/');
  return `${y}-${m}-${d}`;
};

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'system', label: 'Système', icon: 'phone-portrait-outline' },
  { mode: 'dark', label: 'Sombre', icon: 'moon-outline' },
  { mode: 'light', label: 'Clair', icon: 'sunny-outline' },
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [currentPlayer, setPlayer] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncOk, setSyncOk] = useState<boolean | null>(null);
  const [imfSeasons, setImfSeasons] = useState<ImfSeason[]>([]);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({ reminderHour: 17, gameDayHour: 18 });
  const [savingNotif, setSavingNotif] = useState(false);

  // Modal changelog
  const [showChangelogModal, setShowChangelogModal] = useState(false);

  // Modal ajout saison
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [editYear, setEditYear] = useState('');
  const [editDate, setEditDate] = useState('');

  // Modal victoires manuelles
  const [winsSeasonYear, setWinsSeasonYear] = useState<number | null>(null);
  const [showWinsModal, setShowWinsModal] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [savingDate, setSavingDate] = useState(false);


  // Modal logs
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loadingSyncLogs, setLoadingSyncLogs] = useState(false);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);

  // Modal changer de joueur
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  // Modal supprimer victoire
  const [winToDelete, setWinToDelete] = useState<ManualWin | null>(null);

  // Erreurs inline dans les modals
  const [seasonFormError, setSeasonFormError] = useState('');
  const [startDateError, setStartDateError] = useState('');
  const [startDateSaved, setStartDateSaved] = useState(false);
  const [winFormError, setWinFormError] = useState('');

  // Modal ajout/édition d'une victoire individuelle
  const [showAddWinModal, setShowAddWinModal] = useState(false);
  const [editingWin, setEditingWin] = useState<ManualWin | null>(null);
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [selectedFinisher, setSelectedFinisher] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    getCurrentPlayer().then(async (player) => {
      setPlayer(player);
      if (player) {
        const prefs = await getNotificationPrefs(player);
        setNotifPrefs(prefs);
      }
    });
    getLastServerSync().then(setLastSyncState);
    loadImfSeasons();
  }, []);

  const loadImfSeasons = async () => {
    const seasons = await getImfSeasons();
    setImfSeasons(seasons);
  };

  const handleAddSeason = async () => {
    const year = parseInt(editYear);
    if (!year || year < 2020 || year > 2030) {
      setSeasonFormError('Année invalide (entre 2020 et 2030)');
      return;
    }
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(editDate)) {
      setSeasonFormError('Date invalide — format attendu : JJ/MM/AAAA');
      return;
    }
    setSeasonFormError('');
    await upsertImfSeason(year, toIsoDate(editDate));
    setShowSeasonModal(false);
    setEditYear('');
    setEditDate('');
    loadImfSeasons();
  };


  const handleOpenWinsModal = (year: number) => {
    setWinsSeasonYear(year);
    const season = imfSeasons.find((s) => s.year === year);
    setEditStartDate(toDisplayDate(season?.startDate ?? ''));
    setShowWinsModal(true);
  };

  const handleSaveStartDate = async () => {
    if (!winsSeasonYear) return;
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(editStartDate)) {
      setStartDateError('Date invalide — format attendu : JJ/MM/AAAA');
      return;
    }
    setStartDateError('');
    setSavingDate(true);
    try {
      await upsertImfSeason(winsSeasonYear, toIsoDate(editStartDate));
      await loadImfSeasons();
      setStartDateSaved(true);
      setTimeout(() => setStartDateSaved(false), 2000);
    } finally {
      setSavingDate(false);
    }
  };

  const handleDeleteWin = (win: ManualWin) => {
    setWinToDelete(win);
  };

  const confirmDeleteWin = async () => {
    if (!winToDelete) return;
    await deleteManualWin(winToDelete.id);
    setWinToDelete(null);
    loadImfSeasons();
  };

  const handleOpenAddWin = () => {
    setEditingWin(null);
    setSelectedMap(null);
    setSelectedFinisher(null);
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    setSelectedDate(`${dd}/${mm}/${yyyy}`);
    setShowAddWinModal(true);
  };

  const handleOpenEditWin = (win: ManualWin) => {
    setEditingWin(win);
    setSelectedMap(win.mapName);
    setSelectedFinisher(win.finisher);
    setSelectedDate(toDisplayDate(win.winDate ?? ''));
    setShowAddWinModal(true);
  };

  const handleSaveWin = async () => {
    if (!winsSeasonYear) return;
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (selectedDate && !dateRegex.test(selectedDate)) {
      setWinFormError('Date invalide — format attendu : JJ/MM/AAAA');
      return;
    }
    setWinFormError('');
    const isoDate = selectedDate ? toIsoDate(selectedDate) : null;
    if (editingWin) {
      await updateManualWin(editingWin.id, selectedMap, selectedFinisher, isoDate);
    } else {
      await addManualWin(winsSeasonYear, selectedMap, selectedFinisher, isoDate);
    }
    setShowAddWinModal(false);
    loadImfSeasons();
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Jamais synchronisé';
    return date.toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
  };

  const handleChangePlayer = () => {
    setShowPlayerModal(true);
  };

  const selectPlayer = async (name: string) => {
    await setCurrentPlayer(name);
    setPlayer(name);
    registerPushToken(name);
    const prefs = await getNotificationPrefs(name);
    setNotifPrefs(prefs);
    setShowPlayerModal(false);
  };

  const handleSaveNotifPrefs = async (prefs: NotificationPrefs) => {
    if (!currentPlayer) return;
    setSavingNotif(true);
    await saveNotificationPrefs(currentPlayer, prefs);
    setSavingNotif(false);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMsg('Synchronisation en cours...');
    try {
      const { data, error } = await supabase.functions.invoke('sync-pubg-data', {
        method: 'POST',
        body: {},
      });
      if (error) throw error;
      if (data?.status === 'success') {
        const n = data.matchesSaved ?? 0;
        setSyncMsg(n > 0 ? `${n} match${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}` : 'Tout est à jour !');
        setSyncOk(true);
        setLastSyncState(await getLastServerSync());
      } else if (data?.status === 'skipped') {
        setSyncMsg('Une autre synchro est déjà en cours, réessaie dans un instant');
        setSyncOk(true);
      } else {
        setSyncMsg(`Erreur : ${data?.error ?? 'inconnue'}`);
        setSyncOk(false);
      }
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : JSON.stringify(e));
      setSyncMsg(`Erreur : ${msg ?? 'inconnue'}`);
      setSyncOk(false);
    }
    setSyncing(false);
  };

  const handleOpenLogs = async () => {
    setShowLogsModal(true);
    setLoadingSyncLogs(true);
    const { data } = await supabase
      .from('sync_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    setSyncLogs(data ?? []);
    setLoadingSyncLogs(false);
  };

  const handleClearLogs = async () => {
    await supabase.from('sync_log').delete().neq('id', 0);
    setSyncLogs([]);
    setConfirmClearLogs(false);
  };


  const handleOpenChangelog = () => {
    setShowChangelogModal(true);
  };

  const openTracker = (username: string) => {
    Linking.openURL(`${TRACKER_BASE}/${username}/overview?mode=fpp`);
  };

  const currentWinsSeason = imfSeasons.find((s) => s.year === winsSeasonYear);

  return (
    <SwipeableScreen>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>PARAMÈTRES</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Current player */}
        <SectionHeader title="Mon profil" />
        <View style={styles.card}>
          <View style={styles.playerRow}>
            <View style={[styles.avatar, currentPlayer ? { borderColor: PLAYER_COLORS[currentPlayer] ?? colors.primary, backgroundColor: (PLAYER_COLORS[currentPlayer] ?? colors.primary) + '33' } : {}]}>
              <Text style={[styles.avatarText, currentPlayer ? { color: PLAYER_COLORS[currentPlayer] ?? colors.primary } : {}]}>
                {currentPlayer ? currentPlayer[0].toUpperCase() : '?'}
              </Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{currentPlayer ? getDisplayName(currentPlayer) : '—'}</Text>
              <Text style={styles.playerHint}>Joueur actuel</Text>
            </View>
            <TouchableOpacity style={styles.changeBtn} onPress={handleChangePlayer}>
              <Text style={styles.changeBtnText}>Changer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Apparence */}
        <SectionHeader title="Apparence" />
        <View style={styles.card}>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.mode}
                style={[styles.themeBtn, mode === opt.mode && styles.themeBtnActive]}
                onPress={() => setMode(opt.mode)}
              >
                <Ionicons name={opt.icon} size={18} color={mode === opt.mode ? colors.primary : colors.textMuted} />
                <Text style={[styles.themeBtnText, mode === opt.mode && styles.themeBtnTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notification preferences */}
        {currentPlayer && (
          <>
            <SectionHeader title="Notifications" />
            <View style={styles.card}>
              <View style={styles.notifRow}>
                <View style={styles.notifInfo}>
                  <Ionicons name="notifications-outline" size={16} color={colors.textMuted} />
                  <View>
                    <Text style={styles.notifLabel}>Rappel dispo</Text>
                    <Text style={styles.notifSub}>Dim–Ven si pas encore répondu</Text>
                  </View>
                </View>
                <View style={styles.hourPicker}>
                  <TouchableOpacity
                    style={styles.hourBtn}
                    onPress={() => {
                      const next = { ...notifPrefs, reminderHour: Math.max(8, notifPrefs.reminderHour - 1) };
                      setNotifPrefs(next);
                      handleSaveNotifPrefs(next);
                    }}
                  >
                    <Ionicons name="remove" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.hourValue}>{notifPrefs.reminderHour}h</Text>
                  <TouchableOpacity
                    style={styles.hourBtn}
                    onPress={() => {
                      const next = { ...notifPrefs, reminderHour: Math.min(22, notifPrefs.reminderHour + 1) };
                      setNotifPrefs(next);
                      handleSaveNotifPrefs(next);
                    }}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.notifRow, { borderTopWidth: 1, borderTopColor: colors.cardBorder }]}>
                <View style={styles.notifInfo}>
                  <Ionicons name="game-controller-outline" size={16} color={colors.textMuted} />
                  <View>
                    <Text style={styles.notifLabel}>Rappel soir de session</Text>
                    <Text style={styles.notifSub}>Le jour de chaque date retenue</Text>
                  </View>
                </View>
                <View style={styles.hourPicker}>
                  <TouchableOpacity
                    style={styles.hourBtn}
                    onPress={() => {
                      const next = { ...notifPrefs, gameDayHour: Math.max(8, notifPrefs.gameDayHour - 1) };
                      setNotifPrefs(next);
                      handleSaveNotifPrefs(next);
                    }}
                  >
                    <Ionicons name="remove" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.hourValue}>{notifPrefs.gameDayHour}h</Text>
                  <TouchableOpacity
                    style={styles.hourBtn}
                    onPress={() => {
                      const next = { ...notifPrefs, gameDayHour: Math.min(22, notifPrefs.gameDayHour + 1) };
                      setNotifPrefs(next);
                      handleSaveNotifPrefs(next);
                    }}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {savingNotif && (
                <View style={styles.notifSaving}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.notifSavingText}>Sauvegarde...</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Sync */}
        <SectionHeader title="Synchronisation" />
        <View style={styles.card}>
          <View style={styles.syncRow}>
            <View>
              <Text style={styles.syncLabel}>Dernière sync</Text>
              <Text style={styles.syncValue}>{formatLastSync(lastSync)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
              onPress={handleManualSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
          {syncMsg ? (
            <Text style={[styles.syncMsg, !syncing && syncOk === false && { color: colors.danger }, !syncing && syncOk === true && { color: colors.win }]}>
              {syncMsg}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.diagBtn} onPress={handleOpenLogs}>
            <Ionicons name="terminal-outline" size={14} color={colors.textMuted} />
            <Text style={styles.diagBtnText}>Historique des synchronisations</Text>
          </TouchableOpacity>
        </View>

        {/* IMF Seasons */}
        <SectionHeader title="Saisons IMF" />
        <View style={styles.card}>
          {imfSeasons.length === 0 ? (
            <Text style={styles.emptySeasons}>Aucune saison définie</Text>
          ) : (
            imfSeasons.map((season) => (
              <View key={season.year} style={styles.seasonRow}>
                <View style={styles.seasonInfo}>
                  <View style={styles.seasonTitleRow}>
                    <Text style={styles.seasonYear}>Saison {season.year}</Text>
                    {season.isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>EN COURS</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.seasonDate}>
                    Début : {new Date(season.startDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                  {!season.isCurrent && (
                    <Text style={styles.seasonDate}>
                      Fin : {new Date(season.endDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  )}
                  {season.manualWinsDetail.length > 0 && (
                    <Text style={styles.manualWinsText}>
                      ✎ {season.manualWinsDetail.length} victoire{season.manualWinsDetail.length > 1 ? 's' : ''} manuelles
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => handleOpenWinsModal(season.year)}
                >
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <TouchableOpacity
            style={styles.addSeasonBtn}
            onPress={() => setShowSeasonModal(true)}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.addSeasonBtnText}>Ajouter une saison</Text>
          </TouchableOpacity>
        </View>

        {/* Tracker.gg links */}
        <SectionHeader title="Profils tracker.gg" />
        <View style={styles.card}>
          {GROUP_PLAYERS.map((name) => (
            <TouchableOpacity
              key={name}
              style={styles.trackerRow}
              onPress={() => openTracker(name)}
            >
              <View style={[styles.trackerDot, { backgroundColor: PLAYER_COLORS[name] }]} />
              <Text style={styles.trackerName}>{getDisplayName(name)}</Text>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Info */}
        <SectionHeader title="À propos" />
        <View style={styles.card}>
          {[
            ['Application', 'Victoires IMF PUBG'],
            ['Source stats', 'API PUBG officielle'],
            ['Mode de jeu', 'FPP uniquement'],
          ].map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.infoRow} onPress={handleOpenChangelog}>
            <Text style={styles.infoLabel}>Version</Text>
            <View style={styles.versionRow}>
              <Text style={styles.infoValue}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Modal changelog ── */}
      {/* GestureHandlerRootView sur chaque Modal : une Modal crée sa propre fenêtre native
          Android, non couverte par le GestureHandlerRootView racine de l'app — sans ce
          wrapper imbriqué, le scroll à l'intérieur peut devenir incohérent sur Android.
          Fond et contenu sont aussi FRÈRES (pas parent/enfant) : évite le conflit de gestes
          entre un ancêtre cliquable et le ScrollView. */}
      <Modal visible={showChangelogModal} transparent animationType="slide" onRequestClose={() => setShowChangelogModal(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowChangelogModal(false)} />
          <View style={[styles.modalContent, { maxHeight: '80%', flex: 1, paddingBottom: 36 + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historique des versions</Text>
              <TouchableOpacity onPress={() => setShowChangelogModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {CHANGELOG.length === 0 ? (
              <Text style={styles.emptyWins}>Aucune version disponible</Text>
            ) : (
              <View style={{ flex: 1, minHeight: 0 }}>
                <ScrollView showsVerticalScrollIndicator>
                  {CHANGELOG.map((r, i) => (
                    <View key={r.version} style={[styles.changelogItem, i < CHANGELOG.length - 1 && styles.changelogBorder]}>
                      <View style={styles.changelogHeader}>
                        <Text style={styles.changelogVersion}>{r.version}</Text>
                        {r.date ? <Text style={styles.changelogDate}>- {r.date}</Text> : null}
                      </View>
                      {r.notes ? <Text style={styles.changelogNotes}>{r.notes}</Text> : null}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
        </GestureHandlerRootView>
      </Modal>

      {/* ── Modal victoires manuelles (liste + ajout) ── */}
      <Modal visible={showWinsModal} transparent animationType="slide" onRequestClose={() => setShowWinsModal(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowWinsModal(false)} />
          <View style={[styles.modalContent, { maxHeight: '85%', flex: 1, paddingBottom: 36 + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Victoires — Saison {winsSeasonYear}</Text>
              <TouchableOpacity onPress={() => setShowWinsModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, minHeight: 0 }}>
            <ScrollView showsVerticalScrollIndicator>
              {!currentWinsSeason?.manualWinsDetail.length ? (
                <Text style={styles.emptyWins}>Aucune victoire enregistrée</Text>
              ) : (
                <View style={styles.winsList}>
                  {currentWinsSeason?.manualWinsDetail.map((win, idx) => (
                    <View key={win.id} style={[styles.winRow, idx < (currentWinsSeason.manualWinsDetail.length - 1) && styles.winRowBorder]}>
                      <View style={styles.winInfo}>
                        <View style={styles.winMapRow}>
                          <Text style={styles.winMap}>{win.mapName ?? 'Carte inconnue'}</Text>
                          {win.winDate && (
                            <Text style={styles.winDate}>
                              {new Date(win.winDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Text>
                          )}
                        </View>
                        {win.finisher && (
                          <View style={styles.winFinisher}>
                            <Ionicons name="skull-outline" size={11} color={colors.win} />
                            <Text style={styles.winFinisherText}>Dernier kill : <Text style={styles.winFinisherName}>{getDisplayName(win.finisher)}</Text></Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.editWinBtn}
                        onPress={() => handleOpenEditWin(win)}
                      >
                        <Ionicons name="create-outline" size={15} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteWinBtn}
                        onPress={() => handleDeleteWin(win)}
                      >
                        <Ionicons name="trash-outline" size={15} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            </View>

            <TouchableOpacity style={styles.addWinBtn} onPress={handleOpenAddWin}>
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.addWinBtnText}>Ajouter une victoire</Text>
            </TouchableOpacity>

            <View style={styles.startDateSection}>
              <Text style={styles.startDateLabel}>DATE DE DÉBUT DE SAISON</Text>
              <View style={styles.startDateRow}>
                <TextInput
                  style={styles.startDateInput}
                  placeholder="JJ/MM/AAAA"
                  placeholderTextColor={colors.textMuted}
                  value={editStartDate}
                  onChangeText={setEditStartDate}
                  maxLength={10}
                />
                <TouchableOpacity
                  style={[styles.startDateBtn, savingDate && { opacity: 0.5 }]}
                  onPress={handleSaveStartDate}
                  disabled={savingDate}
                >
                  {savingDate
                    ? <ActivityIndicator size="small" color={colors.background} />
                    : <Text style={styles.startDateBtnText}>Enregistrer</Text>
                  }
                </TouchableOpacity>
              </View>
              {startDateError ? <Text style={styles.formError}>{startDateError}</Text> : null}
              {startDateSaved ? <Text style={styles.formSuccess}>✓ Date de début mise à jour</Text> : null}
              <Text style={styles.startDateHint}>
                La fin de la saison précédente sera ajustée automatiquement.
              </Text>
            </View>
          </View>
        </View>
        </GestureHandlerRootView>
      </Modal>

      {/* ── Modal ajout victoire individuelle ── */}
      <Modal visible={showAddWinModal} transparent animationType="slide" onRequestClose={() => setShowAddWinModal(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddWinModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingWin ? 'Modifier la victoire' : 'Nouvelle victoire'}</Text>
              <TouchableOpacity onPress={() => setShowAddWinModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.selectorLabel}>CARTE</Text>
            <View style={styles.chipGrid}>
              {PUBG_MAPS.map((map) => (
                <TouchableOpacity
                  key={map}
                  style={[styles.chip, selectedMap === map && styles.chipSelected]}
                  onPress={() => setSelectedMap(map === selectedMap ? null : map)}
                >
                  <Text style={[styles.chipText, selectedMap === map && styles.chipTextSelected]}>
                    {map}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.selectorLabel}>DATE (optionnel)</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: 15/03/2025"
              placeholderTextColor={colors.textMuted}
              value={selectedDate}
              onChangeText={setSelectedDate}
              maxLength={10}
            />
            <Text style={styles.inputHint}>Format : JJ/MM/AAAA</Text>
            {winFormError ? <Text style={styles.formError}>{winFormError}</Text> : null}

            <Text style={styles.selectorLabel}>FINISHER</Text>
            <View style={styles.chipGrid}>
              {GROUP_PLAYERS.map((player) => (
                <TouchableOpacity
                  key={player}
                  style={[styles.chip, selectedFinisher === player && styles.chipSelected]}
                  onPress={() => setSelectedFinisher(player === selectedFinisher ? null : player)}
                >
                  <View style={styles.chipInner}>
                    <View style={[styles.chipDot, { backgroundColor: PLAYER_COLORS[player] }]} />
                    <Text style={[styles.chipText, selectedFinisher === player && styles.chipTextSelected]}>
                      {getDisplayName(player)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowAddWinModal(false)}
              >
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveWin}>
                <Text style={styles.submitBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
      </Modal>

      {/* ── Modal ajout saison ── */}
      <Modal visible={showSeasonModal} transparent animationType="slide" onRequestClose={() => { setShowSeasonModal(false); setEditYear(''); setEditDate(''); setSeasonFormError(''); }}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setShowSeasonModal(false); setEditYear(''); setEditDate(''); setSeasonFormError(''); }}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Nouvelle saison IMF</Text>

            <Text style={styles.inputLabel}>Année</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: 2026"
              placeholderTextColor={colors.textMuted}
              value={editYear}
              onChangeText={setEditYear}
              keyboardType="numeric"
              maxLength={4}
            />

            <Text style={styles.inputLabel}>Date de début</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: 13/01/2026"
              placeholderTextColor={colors.textMuted}
              value={editDate}
              onChangeText={setEditDate}
              maxLength={10}
            />
            <Text style={styles.inputHint}>Format : JJ/MM/AAAA</Text>
            {seasonFormError ? <Text style={styles.formError}>{seasonFormError}</Text> : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowSeasonModal(false); setEditYear(''); setEditDate(''); setSeasonFormError(''); }}
              >
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleAddSeason}>
                <Text style={styles.submitBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
      </Modal>

      {/* ── Modal changer de joueur ── */}
      <Modal visible={showPlayerModal} transparent animationType="fade" onRequestClose={() => setShowPlayerModal(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPlayerModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Qui es-tu ?</Text>
              <TouchableOpacity onPress={() => setShowPlayerModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {GROUP_PLAYERS.map((name) => {
              const color = PLAYER_COLORS[name] ?? colors.primary;
              const isActive = currentPlayer === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.playerPickRow, isActive && styles.playerPickRowActive]}
                  onPress={() => selectPlayer(name)}
                >
                  <View style={[styles.playerPickAvatar, { borderColor: color, backgroundColor: color + '33' }]}>
                    <Text style={[styles.playerPickAvatarText, { color }]}>
                      {getDisplayName(name)[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.playerPickName, isActive && styles.playerPickNameActive]}>
                    {getDisplayName(name)}
                  </Text>
                  {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
      </Modal>

      {/* ── Modal supprimer victoire ── */}
      <Modal visible={!!winToDelete} transparent animationType="fade" onRequestClose={() => setWinToDelete(null)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={() => setWinToDelete(null)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Supprimer cette victoire ?</Text>
            <Text style={[styles.infoValue, { marginVertical: 12 }]}>
              {winToDelete?.mapName ?? 'Carte inconnue'}{winToDelete?.finisher ? ` — ${getDisplayName(winToDelete.finisher)}` : ''}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setWinToDelete(null)}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.danger }]} onPress={confirmDeleteWin}>
                <Text style={styles.submitBtnText}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
      </Modal>

      {/* ── Modal logs ── */}
      <Modal visible={showLogsModal} transparent animationType="slide" onRequestClose={() => { setShowLogsModal(false); setConfirmClearLogs(false); }}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => { setShowLogsModal(false); setConfirmClearLogs(false); }} />
          <View style={[styles.modalContent, { maxHeight: '85%', flex: 1, paddingBottom: 36 + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historique des synchronisations</Text>
              <TouchableOpacity onPress={() => { setShowLogsModal(false); setConfirmClearLogs(false); }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {loadingSyncLogs ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
            ) : syncLogs.length === 0 ? (
              <Text style={styles.emptyWins}>Aucune synchronisation dans l'historique</Text>
            ) : (
              <View style={{ flex: 1, minHeight: 0 }}>
              <ScrollView showsVerticalScrollIndicator>
                {syncLogs.map((entry) => {
                  const isSuccess = entry.status === 'success';
                  const isError = entry.status === 'error';
                  const isSkipped = entry.status === 'skipped';
                  const statusColor = isSuccess ? colors.win : isError ? colors.danger : colors.textMuted;
                  const statusIcon = isSuccess ? 'checkmark-circle' : isError ? 'close-circle' : isSkipped ? 'pause-circle' : 'sync';
                  const date = new Date(entry.started_at).toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  });
                  const duration = entry.finished_at
                    ? Math.max(1, Math.round((new Date(entry.finished_at).getTime() - new Date(entry.started_at).getTime()) / 1000))
                    : null;
                  const statusText = isSuccess
                    ? (entry.matches_saved > 0 ? `${entry.matches_saved} match${entry.matches_saved > 1 ? 's' : ''} ajouté${entry.matches_saved > 1 ? 's' : ''}` : 'Tout est à jour')
                    : isError ? (entry.error_msg ?? 'Erreur inconnue')
                    : isSkipped ? 'Ignorée (autre synchro en cours)'
                    : 'En cours…';
                  return (
                    <View key={entry.id} style={[styles.logLine, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <Ionicons name={statusIcon as any} size={14} color={statusColor} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{statusText}</Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>
                          {date} · {entry.triggered_by === 'cron' ? 'Auto' : 'Manuel'}{duration !== null ? ` · ${duration}s` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              </View>
            )}
            {confirmClearLogs ? (
              <View style={[styles.modalButtons, { marginTop: 16, flexDirection: 'column', gap: 8 }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                  Vider tout l'historique de synchronisation ?
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmClearLogs(false)}>
                    <Text style={styles.cancelBtnText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.danger }]}
                    onPress={handleClearLogs}
                  >
                    <Text style={styles.submitBtnText}>Confirmer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.modalButtons, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: colors.danger + '22', borderColor: colors.danger }]}
                  onPress={() => setConfirmClearLogs(true)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.danger }]}>Supprimer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={() => setShowLogsModal(false)}>
                  <Text style={styles.submitBtnText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        </GestureHandlerRootView>
      </Modal>

    </SafeAreaView>
    </SwipeableScreen>
  );
}

function getStyles(colors: ColorScheme) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: 3 },
  content: { flex: 1, paddingHorizontal: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
    overflow: 'hidden',
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary + '33',
    borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 17, fontWeight: '700', color: colors.text },
  playerHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  changeBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.primary,
    backgroundColor: colors.primary + '22',
  },
  changeBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  syncRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, paddingBottom: 8,
  },
  syncLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 3 },
  syncValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  syncBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1, borderColor: colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  syncBtnDisabled: { opacity: 0.4 },
  syncMsg: { fontSize: 12, color: colors.primary, paddingHorizontal: 14, paddingBottom: 8, fontStyle: 'italic' },
  diagBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 12, paddingHorizontal: 14,
    borderTopWidth: 1, borderTopColor: colors.cardBorder,
  },
  diagBtnText: { fontSize: 12, color: colors.textMuted },
  trackerRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  trackerDot: { width: 10, height: 10, borderRadius: 5 },
  trackerName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  infoLabel: { fontSize: 13, color: colors.textMuted },
  infoValue: { fontSize: 13, color: colors.text, fontWeight: '600' },
  emptySeasons: { fontSize: 13, color: colors.textMuted, padding: 14, textAlign: 'center' },
  seasonRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: colors.cardBorder, gap: 10,
  },
  seasonInfo: { flex: 1 },
  seasonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  seasonYear: { fontSize: 15, fontWeight: '700', color: colors.text },
  currentBadge: {
    backgroundColor: colors.primary + '33',
    borderWidth: 1, borderColor: colors.primary,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  currentBadgeText: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  seasonDate: { fontSize: 12, color: colors.textMuted },
  editBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  manualWinsText: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 3 },
  addSeasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, borderTopWidth: 1, borderTopColor: colors.cardBorder,
  },
  addSeasonBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  // modalRoot/modalBackdrop : variante "frères" (pas parent/enfant) du fond + contenu, pour
  // les modals avec ScrollView — évite tout conflit de gestes Android entre un ancêtre
  // cliquable et le ScrollView (scroll erratique). Les modals sans scroll gardent modalOverlay.
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)' },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 20, paddingBottom: 36, width: '100%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  emptyWins: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  winsList: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder,
    marginBottom: 12, overflow: 'hidden',
  },
  winRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  winRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  winInfo: { flex: 1 },
  winMapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  winMap: { fontSize: 14, fontWeight: '700', color: colors.text },
  winDate: { fontSize: 11, color: colors.textMuted },
  winFinisher: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  winFinisherText: { fontSize: 12, color: colors.textMuted },
  winFinisherName: { fontWeight: '700', color: colors.win },
  editWinBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.primary + '22',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 6,
  },
  deleteWinBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.danger + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  addWinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: colors.cardBorder,
  },
  addWinBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  startDateSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  startDateLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    color: colors.textMuted, marginBottom: 10,
  },
  startDateRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  startDateInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: 8, padding: 10, fontSize: 15, color: colors.text,
  },
  startDateBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  startDateBtnText: { fontSize: 13, fontWeight: '800', color: colors.background },
  startDateHint: { fontSize: 11, color: colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  selectorLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    color: colors.textMuted, marginBottom: 8, marginTop: 12,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: colors.cardBorder,
    backgroundColor: colors.backgroundSecondary,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextSelected: { color: colors.primary, fontWeight: '800' },
  inputLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: 8, padding: 12, fontSize: 15, color: colors.text,
  },
  inputHint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  submitBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '800', color: colors.background },
  logLine: { flexDirection: 'row', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  formError: { fontSize: 12, color: colors.danger, marginTop: 6, fontStyle: 'italic' },
  formSuccess: { fontSize: 12, color: colors.win, marginTop: 6, fontWeight: '600' },
  playerPickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: colors.cardBorder,
    backgroundColor: colors.backgroundSecondary,
  },
  playerPickRowActive: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
  playerPickAvatar: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  playerPickAvatarText: { fontSize: 17, fontWeight: '800' },
  playerPickName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  playerPickNameActive: { color: colors.text, fontWeight: '800' },
  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, gap: 12 },
  notifInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  notifLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  notifSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  hourPicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.primary + '22',
    borderWidth: 1, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  hourValue: { fontSize: 16, fontWeight: '800', color: colors.primary, minWidth: 32, textAlign: 'center' },
  notifSaving: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  notifSavingText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changelogItem: { paddingVertical: 14 },
  changelogBorder: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  changelogHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  changelogVersion: { fontSize: 15, fontWeight: '800', color: colors.primary },
  changelogDate: { fontSize: 12, color: colors.textMuted },
  changelogNotes: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  themeRow: { flexDirection: 'row', padding: 10, gap: 8 },
  themeBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.backgroundSecondary,
  },
  themeBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
  themeBtnText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  themeBtnTextActive: { color: colors.primary, fontWeight: '800' },
  });
}
