import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
// getContentUriAsync spécifiquement depuis le sous-module "legacy" : depuis
// 'expo-file-system' directement, cette fonction lève une exception
// "deprecated" au lieu de fonctionner (même piège que documenté dans le
// projet seedbox-manager, confirmé là-bas via le vrai message d'erreur).
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import type { UpdateInfo } from '../lib/update-check';
import type { ColorScheme } from '../constants/colors';

/** Télécharge l'APK de la release GitHub (dépôt public - pas besoin de
 * token/proxy, contrairement à seedbox-manager) et lance directement
 * l'installateur natif Android, sans passer par le navigateur. */
async function downloadAndInstallUpdate(
  downloadUrl: string,
  onProgress: (percent: number | null) => void
): Promise<void> {
  const destination = new File(Paths.cache, 'imf-pubg-update.apk');
  const file = await File.downloadFileAsync(downloadUrl, destination, {
    idempotent: true,
    // Sans timeout, un réseau qui traîne bloque le téléchargement
    // indéfiniment - et avec lui la fenêtre de maj.
    signal: AbortSignal.timeout(180000),
    // totalBytes vaut -1 si le serveur ne renvoie pas Content-Length - pas
    // le cas ici (GitHub Releases l'envoie nativement), mais on reste
    // défensif plutôt que d'afficher "-1%".
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress(totalBytes > 0 ? Math.round((bytesWritten / totalBytes) * 100) : null);
    },
  });
  // Un fichier local file:// n'est pas accessible par l'installateur système
  // (autre appli) sans passer par un FileProvider content://.
  const contentUri = await getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
  // startActivityAsync ne se résout qu'au retour à l'appli (installateur
  // annulé/terminé) - l'installateur système a déjà fini de lire l'APK à ce
  // moment-là, sûr de le supprimer. Sans ça, le fichier (~50 Mo) restait en
  // cache indéfiniment (jamais nettoyé, confirmé en relisant le code).
  try {
    file.delete();
  } catch {
    // Pas grave si ça échoue (fichier déjà absent, permissions...) - le
    // prochain téléchargement écrase de toute façon le même nom de fichier.
  }
}

/** Fenêtre "nouvelle version" thémée (pas la popup système Alert.alert, qui
 * ne suit jamais le thème clair/sombre de l'appli), avec téléchargement +
 * installation en un tap et pourcentage d'avancement - même mécanisme que
 * seedbox-manager. */
export function UpdateModal({
  info, onDismiss, colors,
}: {
  info: UpdateInfo;
  onDismiss: () => void;
  colors: ColorScheme;
}) {
  const styles = getStyles(colors);
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  function handleUpdate() {
    if (!info.downloadUrl) {
      setStatus('error');
      setErrorDetail('Aucun APK trouvé sur cette release.');
      return;
    }
    setStatus('downloading');
    setErrorDetail(null);
    setProgressPercent(null);
    downloadAndInstallUpdate(info.downloadUrl, setProgressPercent)
      .then(() => {
        // startActivityAsync se résout quand l'utilisateur revient à
        // l'appli (installateur annulé/terminé) - sans ça, "downloading"
        // restait bloqué pour toujours si l'install était annulée.
        setStatus('idle');
      })
      .catch((e: any) => {
        console.error('Échec mise à jour auto :', e);
        setErrorDetail(e?.message ?? String(e));
        setStatus('error');
      });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={status === 'downloading' ? undefined : onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Nouvelle version disponible</Text>
          <Text style={styles.body}>
            La version {info.version} est disponible{Constants.expoConfig?.version ? ` (version ${Constants.expoConfig.version} installée)` : ''}.
          </Text>
          {status === 'error' && (
            <>
              <Text style={styles.errorText}>Échec du téléchargement automatique{errorDetail ? ` : ${errorDetail}` : ''}.</Text>
              <Pressable onPress={() => Linking.openURL('https://github.com/FabFixxx/victoires-imf-pubg/releases/latest')}>
                <Text style={styles.linkText}>Voir sur GitHub</Text>
              </Pressable>
            </>
          )}
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={onDismiss}
              disabled={status === 'downloading'}
            >
              <Text style={styles.secondaryBtnText}>Plus tard</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, status === 'downloading' && styles.primaryBtnDisabled]}
              onPress={handleUpdate}
              disabled={status === 'downloading'}
            >
              {status === 'downloading' ? (
                progressPercent != null ? (
                  <Text style={styles.primaryBtnText}>{progressPercent}%</Text>
                ) : (
                  <ActivityIndicator color="#0A0A0A" />
                )
              ) : (
                <Text style={styles.primaryBtnText}>Mettre à jour</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getStyles(colors: ColorScheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    card: {
      width: '100%', maxWidth: 380,
      backgroundColor: colors.card, borderRadius: 16,
      borderWidth: 1, borderColor: colors.cardBorder,
      padding: 20,
    },
    title: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8 },
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    errorText: { color: colors.danger, fontSize: 13, marginTop: 8 },
    linkText: { color: colors.primary, fontSize: 13, fontWeight: '700', marginTop: 4 },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 20 },
    secondaryBtn: { paddingVertical: 10, paddingHorizontal: 14 },
    secondaryBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 18,
      alignItems: 'center', justifyContent: 'center', minWidth: 110,
    },
    primaryBtnDisabled: { opacity: 0.7 },
    primaryBtnText: { color: '#0A0A0A', fontSize: 14, fontWeight: '700' },
  });
}
