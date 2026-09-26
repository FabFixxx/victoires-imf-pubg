// Porté depuis seedbox-manager (server/index.js) - même pattern exact,
// nécessaire car le dépôt GitHub de ce projet passe en privé : le token
// GitHub reste côté serveur uniquement (jamais dans l'APK - un appel
// direct depuis le client exposerait le token, extractible de l'APK).
// Préfixé "_lib" (pas "api/xxx.js" directement) : Vercel transforme
// AUTOMATIQUEMENT tout fichier posé directement dans api/ en sa propre
// route serverless - un dossier préfixé "_" est ignoré par cette
// détection, donc ce module partagé n'est jamais exposé comme endpoint.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const GITHUB_REPO = 'FabFixxx/victoires-imf-pubg';

// Cache en mémoire par instance de fonction serverless - persiste tant que
// le conteneur reste "chaud" entre deux invocations (optimisation best
// effort, pas garantie sur un cold start, sans incidence sur la
// correction : au pire, un appel GitHub de plus).
let latestReleaseCache = null;
let latestReleaseCacheAt = 0;
const LATEST_RELEASE_CACHE_MS = 5 * 60 * 1000;

async function fetchLatestRelease() {
  const now = Date.now();
  if (latestReleaseCacheAt && now - latestReleaseCacheAt < LATEST_RELEASE_CACHE_MS) return latestReleaseCache;
  if (!GITHUB_TOKEN) {
    latestReleaseCache = null;
    latestReleaseCacheAt = now;
    return null;
  }
  let release = null;
  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    });
    if (resp.ok) release = await resp.json();
  } catch {
    // erreur réseau - traitée comme un échec ordinaire, voir commentaire ci-dessus
  }
  latestReleaseCache = release;
  latestReleaseCacheAt = now;
  return release;
}

module.exports = { fetchLatestRelease, GITHUB_TOKEN };
