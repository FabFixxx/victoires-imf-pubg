import { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Colors } from '../../constants/colors';
import { SectionHeader } from '../../components/SectionHeader';
import { getCurrentPlayer, setCurrentPlayer, getLastSync, setLastSync } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { PUBG_API_KEY } from '../../constants/config';
import { syncData, PUBG_MAPS } from '../../lib/pubg-api';
import { registerPushToken } from '../../lib/notifications';
import {
  getImfSeasons, upsertImfSeason,
  addManualWin, updateManualWin, deleteManualWin,
  ImfSeason, ManualWin,
} from '../../lib/imf-seasons';
import { GROUP_PLAYERS, getDisplayName } from '../../constants/players';
import { PLAYER_COLORS, getNotificationPrefs, saveNotificationPrefs, NotificationPrefs } from '../../lib/availability';

const TRACKER_BASE = 'https://tracker.gg/pubg/profile/steam';

export default function SettingsScreen() {
  const [currentPlayer, setPlayer] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [imfSeasons, setImfSeasons] = useState<ImfSeason[]>([]);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({ reminderHour: 17, gameDayHour: 18 });
  const [savingNotif, setSavingNotif] = useState(false);

  // Modal changelog
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [releases, setReleases] = useState<{ version: string; date: string; notes: string }[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);

  // Modal ajout saison
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [editYear, setEditYear] = useState('');
  const [editDate, setEditDate] = useState('');

  // Modal victoires manuelles
  const [winsSeasonYear, setWinsSeasonYear] = useState<number | null>(null);
  const [showWinsModal, setShowWinsModal] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [savingDate, setSavingDate] = useState(false);

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
    getLastSync().then(setLastSyncState);
    loadImfSeasons();
  }, []);

  const loadImfSeasons = async () => {
    const seasons = await getImfSeasons();
    setImfSeasons(seasons);
  };

  const handleAddSeason = async () => {
    const year = parseInt(editYear);
    if (!year || year < 2020 || year > 2030) {
      Alert.alert('Année invalide', 'Entrez une année entre 2020 et 2030');
      return;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(editDate)) {
      Alert.alert('Date invalide', 'Format attendu : YYYY-MM-DD (ex: 2026-01-13)');
      return;
    }
    await upsertImfSeason(year, editDate);
    setShowSeasonModal(false);
    setEditYear('');
    setEditDate('');
    loadImfSeasons();
  };


  const handleOpenWinsModal = (year: number) => {
    setWinsSeasonYear(year);
    const season = imfSeasons.find((s) => s.year === year);
    setEditStartDate(season?.startDate ?? '');
    setShowWinsModal(true);
  };

  const handleSaveStartDate = async () => {
    if (!winsSeasonYear) return;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(editStartDate)) {
      Alert.alert('Date invalide', 'Format attendu : AAAA-MM-JJ (ex: 2026-01-13)');
      return;
    }
    setSavingDate(true);
    await upsertImfSeason(winsSeasonYear, editStartDate);
    await loadImfSeasons();
    setSavingDate(false);
    Alert.alert('Sauvegardé', 'Date de début mise à jour.');
  };

  const handleDeleteWin = (win: ManualWin) => {
    Alert.alert(
      'Supprimer cette victoire ?',
      `${win.mapName ?? 'Carte inconnue'} — Finisher : ${win.finisher ?? '—'}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          await deleteManualWin(win.id);
          loadImfSeasons();
        }},
      ]
    );
  };

  const handleOpenAddWin = () => {
    setEditingWin(null);
    setSelectedMap(null);
    setSelectedFinisher(null);
    setSelectedDate('');
    setShowAddWinModal(true);
  };

  const handleOpenEditWin = (win: ManualWin) => {
    setEditingWin(win);
    setSelectedMap(win.mapName);
    setSelectedFinisher(win.finisher);
    setSelectedDate(win.winDate ?? '');
    setShowAddWinModal(true);
  };

  const handleSaveWin = async () => {
    if (!winsSeasonYear) return;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (selectedDate && !dateRegex.test(selectedDate)) {
      Alert.alert('Date invalide', 'Format attendu : AAAA-MM-JJ (ex: 2025-03-15)');
      return;
    }
    if (editingWin) {
      await updateManualWin(editingWin.id, selectedMap, selectedFinisher, selectedDate || null);
    } else {
      await addManualWin(winsSeasonYear, selectedMap, selectedFinisher, selectedDate || null);
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
    Alert.alert(
      'Changer de joueur',
      'Qui es-tu ?',
      GROUP_PLAYERS.map((name) => ({
        text: getDisplayName(name),
        onPress: async () => {
          await setCurrentPlayer(name);
          setPlayer(name);
          registerPushToken(name);
        },
      }))
    );
  };

  const handleSaveNotifPrefs = async (prefs: NotificationPrefs) => {
    if (!currentPlayer) return;
    setSavingNotif(true);
    await saveNotificationPrefs(currentPlayer, prefs);
    setSavingNotif(false);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMsg('Démarrage...');
    try {
      await syncData((msg) => setSyncMsg(msg));
      const now = new Date();
      await setLastSync(now);
      setLastSyncState(now);
    } catch (e: any) {
      const msg = e?.message ?? String(e) ?? 'Erreur inconnue';
      setSyncMsg(`Erreur: ${msg}`);
      Alert.alert('Erreur de sync', msg);
    }
    setSyncing(false);
  };

  const handleDiagnostic = async () => {
    const results: string[] = [];
    try {
      const { data, error } = await supabase.from('players').select('username').limit(1);
      if (error) results.push(`Supabase ❌ ${error.message}`);
      else results.push(`Supabase ✓ (${data?.length ?? 0} lignes)`);
    } catch (e: any) {
      results.push(`Supabase ❌ ${e?.message}`);
    }
    try {
      const res = await fetch(
        'https://api.pubg.com/shards/steam/players?filter[playerNames]=FabFix',
        { headers: { Authorization: `Bearer ${PUBG_API_KEY}`, Accept: 'application/vnd.api+json' } }
      );
      if (res.ok) results.push(`PUBG API ✓ (${res.status})`);
      else results.push(`PUBG API ❌ HTTP ${res.status}`);
    } catch (e: any) {
      results.push(`PUBG API ❌ ${e?.message}`);
    }
    Alert.alert('Diagnostic', results.join('\n\n'));
  };

  const handleOpenChangelog = async () => {
    setShowChangelogModal(true);
    if (releases.length > 0) return;
    setLoadingReleases(true);
    try {
      const res = await fetch('https://api.github.com/repos/FabFixxx/victoires-imf-pubg/releases');
      const data = await res.json();
      const parsed = (data ?? []).map((r: any) => ({
        version: r.tag_name ?? '',
        date: r.published_at ? new Date(r.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
        notes: r.body ?? '',
      }));
      parsed.sort((a, b) => {
        const va = a.version.replace(/^v/, '').split('.').map(Number);
        const vb = b.version.replace(/^v/, '').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if ((vb[i] ?? 0) !== (va[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
        }
        return 0;
      });
      setReleases(parsed);
    } catch {
      setReleases([]);
    }
    setLoadingReleases(false);
  };

  const openTracker = (username: string) => {
    Linking.openURL(`${TRACKER_BASE}/${username}/overview?mode=fpp`);
  };

  const currentWinsSeason = imfSeasons.find((s) => s.year === winsSeasonYear);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>PARAMÈTRES</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Current player */}
        <SectionHeader title="Mon profil" />
        <View style={styles.card}>
          <View style={styles.playerRow}>
            <View style={[styles.avatar, currentPlayer ? { borderColor: PLAYER_COLORS[currentPlayer] ?? Colors.primary, backgroundColor: (PLAYER_COLORS[currentPlayer] ?? Colors.primary) + '33' } : {}]}>
              <Text style={[styles.avatarText, currentPlayer ? { color: PLAYER_COLORS[currentPlayer] ?? Colors.primary } : {}]}>
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

        {/* Notification preferences */}
        {currentPlayer && (
          <>
            <SectionHeader title="Notifications" />
            <View style={styles.card}>
              <View style={styles.notifRow}>
                <View style={styles.notifInfo}>
                  <Ionicons name="notifications-outline" size={16} color={Colors.textMuted} />
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
                    <Ionicons name="remove" size={16} color={Colors.primary} />
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
                    <Ionicons name="add" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.notifRow, { borderTopWidth: 1, borderTopColor: Colors.cardBorder }]}>
                <View style={styles.notifInfo}>
                  <Ionicons name="game-controller-outline" size={16} color={Colors.textMuted} />
                  <View>
                    <Text style={styles.notifLabel}>Rappel soir de session</Text>
                    <Text style={styles.notifSub}>Le jour de la date retenue</Text>
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
                    <Ionicons name="remove" size={16} color={Colors.primary} />
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
                    <Ionicons name="add" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {savingNotif && (
                <View style={styles.notifSaving}>
                  <ActivityIndicator size="small" color={Colors.primary} />
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
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="refresh" size={18} color={Colors.primary} />
              )}
            </TouchableOpacity>
          </View>
          {syncing && syncMsg ? <Text style={styles.syncMsg}>{syncMsg}</Text> : null}
          {!syncing && syncMsg ? <Text style={[styles.syncMsg, { color: Colors.danger }]}>{syncMsg}</Text> : null}
          <TouchableOpacity style={styles.diagBtn} onPress={handleDiagnostic}>
            <Ionicons name="bug-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.diagBtnText}>Tester la connexion</Text>
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
                    Début : {new Date(season.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                  {!season.isCurrent && (
                    <Text style={styles.seasonDate}>
                      Fin : {new Date(season.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
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
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <TouchableOpacity
            style={styles.addSeasonBtn}
            onPress={() => setShowSeasonModal(true)}
          >
            <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
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
              <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
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
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Modal changelog ── */}
      <Modal visible={showChangelogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historique des versions</Text>
              <TouchableOpacity onPress={() => setShowChangelogModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {loadingReleases ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
            ) : releases.length === 0 ? (
              <Text style={styles.emptyWins}>Aucune version disponible</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {releases.map((r, i) => (
                  <View key={r.version} style={[styles.changelogItem, i < releases.length - 1 && styles.changelogBorder]}>
                    <View style={styles.changelogHeader}>
                      <Text style={styles.changelogVersion}>{r.version}</Text>
                      {r.date ? <Text style={styles.changelogDate}>{r.date}</Text> : null}
                    </View>
                    {r.notes ? <Text style={styles.changelogNotes}>{r.notes}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal victoires manuelles (liste + ajout) ── */}
      <Modal visible={showWinsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Victoires — Saison {winsSeasonYear}</Text>
              <TouchableOpacity onPress={() => setShowWinsModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {currentWinsSeason?.manualWinsDetail.length === 0 ? (
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
                          <Ionicons name="skull-outline" size={11} color={Colors.win} />
                          <Text style={styles.winFinisherText}>Dernier kill : <Text style={styles.winFinisherName}>{win.finisher}</Text></Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.editWinBtn}
                      onPress={() => handleOpenEditWin(win)}
                    >
                      <Ionicons name="create-outline" size={15} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteWinBtn}
                      onPress={() => handleDeleteWin(win)}
                    >
                      <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.addWinBtn} onPress={handleOpenAddWin}>
              <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
              <Text style={styles.addWinBtnText}>Ajouter une victoire</Text>
            </TouchableOpacity>

            <View style={styles.startDateSection}>
              <Text style={styles.startDateLabel}>DATE DE DÉBUT DE SAISON</Text>
              <View style={styles.startDateRow}>
                <TextInput
                  style={styles.startDateInput}
                  placeholder="AAAA-MM-JJ"
                  placeholderTextColor={Colors.textMuted}
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
                    ? <ActivityIndicator size="small" color={Colors.background} />
                    : <Text style={styles.startDateBtnText}>Enregistrer</Text>
                  }
                </TouchableOpacity>
              </View>
              <Text style={styles.startDateHint}>
                La fin de la saison précédente sera ajustée automatiquement.
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal ajout victoire individuelle ── */}
      <Modal visible={showAddWinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingWin ? 'Modifier la victoire' : 'Nouvelle victoire'}</Text>
              <TouchableOpacity onPress={() => setShowAddWinModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
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
              placeholder="ex: 2025-03-15"
              placeholderTextColor={Colors.textMuted}
              value={selectedDate}
              onChangeText={setSelectedDate}
              maxLength={10}
            />
            <Text style={styles.inputHint}>Format : AAAA-MM-JJ</Text>

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
          </View>
        </View>
      </Modal>

      {/* ── Modal ajout saison ── */}
      <Modal visible={showSeasonModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouvelle saison IMF</Text>

            <Text style={styles.inputLabel}>Année</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: 2026"
              placeholderTextColor={Colors.textMuted}
              value={editYear}
              onChangeText={setEditYear}
              keyboardType="numeric"
              maxLength={4}
            />

            <Text style={styles.inputLabel}>Date de début</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: 2026-01-13"
              placeholderTextColor={Colors.textMuted}
              value={editDate}
              onChangeText={setEditDate}
              maxLength={10}
            />
            <Text style={styles.inputHint}>Format : AAAA-MM-JJ</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowSeasonModal(false); setEditYear(''); setEditDate(''); }}
              >
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleAddSeason}>
                <Text style={styles.submitBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, letterSpacing: 3 },
  content: { flex: 1, paddingHorizontal: 16 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
    overflow: 'hidden',
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary + '33',
    borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  playerHint: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  changeBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  changeBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  syncRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, paddingBottom: 8,
  },
  syncLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 3 },
  syncValue: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  syncBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  syncBtnDisabled: { opacity: 0.4 },
  syncMsg: { fontSize: 12, color: Colors.primary, paddingHorizontal: 14, paddingBottom: 8, fontStyle: 'italic' },
  diagBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 12, paddingHorizontal: 14,
    borderTopWidth: 1, borderTopColor: Colors.cardBorder,
  },
  diagBtnText: { fontSize: 12, color: Colors.textMuted },
  trackerRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.cardBorder,
  },
  trackerDot: { width: 10, height: 10, borderRadius: 5 },
  trackerName: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.cardBorder,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  emptySeasons: { fontSize: 13, color: Colors.textMuted, padding: 14, textAlign: 'center' },
  seasonRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, gap: 10,
  },
  seasonInfo: { flex: 1 },
  seasonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  seasonYear: { fontSize: 15, fontWeight: '700', color: Colors.text },
  currentBadge: {
    backgroundColor: Colors.primary + '33',
    borderWidth: 1, borderColor: Colors.primary,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  currentBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  seasonDate: { fontSize: 12, color: Colors.textMuted },
  editBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  manualWinsText: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 3 },
  addSeasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, borderTopWidth: 1, borderTopColor: Colors.cardBorder,
  },
  addSeasonBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 20, paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  emptyWins: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  winsList: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder,
    marginBottom: 12, overflow: 'hidden',
  },
  winRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  winRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  winInfo: { flex: 1 },
  winMapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  winMap: { fontSize: 14, fontWeight: '700', color: Colors.text },
  winDate: { fontSize: 11, color: Colors.textMuted },
  winFinisher: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  winFinisherText: { fontSize: 12, color: Colors.textMuted },
  winFinisherName: { fontWeight: '700', color: Colors.win },
  editWinBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary + '22',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 6,
  },
  deleteWinBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.danger + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  addWinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.cardBorder,
  },
  addWinBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  startDateSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  startDateLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    color: Colors.textMuted, marginBottom: 10,
  },
  startDateRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  startDateInput: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: 8, padding: 10, fontSize: 15, color: Colors.text,
  },
  startDateBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  startDateBtnText: { fontSize: 13, fontWeight: '800', color: Colors.background },
  startDateHint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  selectorLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    color: Colors.textMuted, marginBottom: 8, marginTop: 12,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.cardBorder,
    backgroundColor: Colors.backgroundSecondary,
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '800' },
  inputLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: 8, padding: 12, fontSize: 15, color: Colors.text,
  },
  inputHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '800', color: Colors.background },
  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, gap: 12 },
  notifInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  notifLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  notifSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  hourPicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary + '22',
    borderWidth: 1, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  hourValue: { fontSize: 16, fontWeight: '800', color: Colors.primary, minWidth: 32, textAlign: 'center' },
  notifSaving: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  notifSavingText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changelogItem: { paddingVertical: 14 },
  changelogBorder: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  changelogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  changelogVersion: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  changelogDate: { fontSize: 12, color: Colors.textMuted },
  changelogNotes: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
});
