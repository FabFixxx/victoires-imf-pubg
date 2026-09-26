import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Passe par notre propre serveur (api/app-version.js), plus par GitHub
// directement : le dépôt est privé, un appel non authentifié depuis le
// client échouerait (404) - voir api/_lib/github.js pour le token côté
// serveur. Même pattern que seedbox-manager.
const APP_VERSION_API = 'https://imf.ignorelist.com/api/app-version';
const APP_DOWNLOAD_URL = 'https://imf.ignorelist.com/api/app-download';

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map(Number);
}

function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const res = await fetch(APP_VERSION_API);
    if (!res.ok) return null;
    const data = await res.json();

    const latestVersion: string = data.version ?? '';
    const currentVersion = Constants.expoConfig?.version ?? '1.0.0';

    if (!latestVersion || !isNewer(latestVersion, currentVersion)) return null;

    // downloadUrl n'est plus une URL de release précise (le serveur résout
    // toujours "la dernière" lui-même, voir api/app-download.js) - toujours
    // le même endpoint fixe.
    return {
      version: latestVersion,
      downloadUrl: APP_DOWNLOAD_URL,
      releaseNotes: '',
    };
  } catch {
    return null;
  }
}
