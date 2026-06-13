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
import { Colors } from '../../constants/colors';
import { SectionHeader } from '../../components/SectionHeader';
import { getCurrentPlayer, setCurrentPlayer, getLastSync, setLastSync } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { PUBG_API_KEY } from '../../constants/config';
import { syncData } from '../../lib/pubg-api';
import { registerPushToken } from '../../lib/notifications';
import { getImfSeasons, upsertImfSeason, deleteImfSeason, ImfSeason } from '../../lib/imf-seasons';
import { GROUP_PLAYERS } from '../../constants/config';

const TRACKER_BASE = 'https://tracker.gg/pubg/profile/steam';

export default function SettingsScreen() {
  const [currentPlayer, setPlayer] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [imfSeasons, setImfSeasons] = useState<ImfSeason[]>([]);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [editYear, setEditYear] = useState('');
  const [editDate, setEditDate] = useState('');

  useEffect(() => {
    getCurrentPlayer().then(setPlayer);
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

  const handleDeleteSeason = (year: number) => {
    Alert.alert(
      'Supprimer la saison',
      `Supprimer la saison IMF ${year} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          await deleteImfSeason(year);
          loadImfSeasons();
        }},
      ]
    );
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
        text: name,
        onPress: async () => {
          await setCurrentPlayer(name);
          setPlayer(name);
          registerPushToken(name);
        },
      }))
    );
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

    // Test Supabase
    try {
      const { data, error } = await supabase.from('players').select('username').limit(1);
      if (error) results.push(`Supabase ❌ ${error.message}`);
      else results.push(`Supabase ✓ (${data?.length ?? 0} lignes)`);
    } catch (e: any) {
      results.push(`Supabase ❌ ${e?.message}`);
    }

    // Test PUBG API
    try {
      const res = await fetch(
        'https://api.pubg.com/shards/steam/players?filter[playerNames]=FabFix',
        {
          headers: {
            Authorization: `Bearer ${PUBG_API_KEY}`,
            Accept: 'application/vnd.api+json',
          },
        }
      );
      if (res.ok) results.push(`PUBG API ✓ (${res.status})`);
      else results.push(`PUBG API ❌ HTTP ${res.status}`);
    } catch (e: any) {
      results.push(`PUBG API ❌ ${e?.message}`);
    }

    Alert.alert('Diagnostic', results.join('\n\n'));
  };

  const openTracker = (username: string) => {
    Linking.openURL(`${TRACKER_BASE}/${username}/overview?mode=fpp`);
  };

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
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {currentPlayer ? currentPlayer[0].toUpperCase() : '?'}
              </Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{currentPlayer ?? '—'}</Text>
              <Text style={styles.playerHint}>Joueur actuel</Text>
            </View>
            <TouchableOpacity style={styles.changeBtn} onPress={handleChangePlayer}>
              <Text style={styles.changeBtnText}>Changer</Text>
            </TouchableOpacity>
          </View>
        </View>

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
          {syncing && syncMsg ? (
            <Text style={styles.syncMsg}>{syncMsg}</Text>
          ) : null}
          {!syncing && syncMsg ? (
            <Text style={[styles.syncMsg, { color: Colors.danger }]}>{syncMsg}</Text>
          ) : null}
          <Text style={styles.syncNote}>
            La sync auto se déclenche au lancement si la dernière date de plus de 2h.
          </Text>
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
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteSeason(season.year)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
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
              <View style={styles.trackerAvatar}>
                <Text style={styles.trackerAvatarText}>{name[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.trackerName}>{name}</Text>
              <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Info */}
        <SectionHeader title="À propos" />
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Application</Text>
            <Text style={styles.infoValue}>Victoires IMF PUBG</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Source stats</Text>
            <Text style={styles.infoValue}>API PUBG officielle</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Mode de jeu</Text>
            <Text style={styles.infoValue}>FPP uniquement</Text>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Modal ajout saison */}
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
  content: { flex: 1, paddingHorizontal: 16 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '33',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  playerHint: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  changeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  changeBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingBottom: 8,
  },
  syncLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 3 },
  syncValue: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  syncBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnDisabled: { opacity: 0.4 },
  syncMsg: {
    fontSize: 12,
    color: Colors.primary,
    paddingHorizontal: 14,
    paddingBottom: 8,
    fontStyle: 'italic',
  },
  syncNote: {
    fontSize: 11,
    color: Colors.textMuted,
    paddingHorizontal: 14,
    paddingBottom: 12,
    lineHeight: 16,
  },
  diagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  diagBtnText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  trackerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackerAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  trackerName: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  emptySeasons: { fontSize: 13, color: Colors.textMuted, padding: 14, textAlign: 'center' },
  seasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 10,
  },
  seasonInfo: { flex: 1 },
  seasonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  seasonYear: { fontSize: 15, fontWeight: '700', color: Colors.text },
  currentBadge: {
    backgroundColor: Colors.primary + '33',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  seasonDate: { fontSize: 12, color: Colors.textMuted },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.danger + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSeasonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  addSeasonBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 20 },
  inputLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
  },
  inputHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  submitBtnText: { fontSize: 14, fontWeight: '800', color: Colors.background },
});
