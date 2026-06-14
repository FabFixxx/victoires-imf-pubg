import { Platform } from 'react-native';
import Constants from 'expo-constants';

const GITHUB_RELEASES_API =
  'https://api.github.com/repos/FabFixxx/victoires-imf-pubg/releases/latest';

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
    const res = await fetch(GITHUB_RELEASES_API);
    if (!res.ok) return null;
    const data = await res.json();

    const latestTag: string = data.tag_name ?? '';
    const currentVersion = Constants.expoConfig?.version ?? '1.0.0';

    if (!latestTag || !isNewer(latestTag, currentVersion)) return null;

    const apkAsset = (data.assets ?? []).find((a: { name: string }) =>
      a.name.endsWith('.apk')
    );
    const downloadUrl: string =
      apkAsset?.browser_download_url ?? data.html_url ?? '';

    return {
      version: latestTag,
      downloadUrl,
      releaseNotes: data.body ?? '',
    };
  } catch {
    return null;
  }
}
