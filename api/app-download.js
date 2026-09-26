// Voir api/_lib/github.js pour le pourquoi (dépôt privé, token côté
// serveur). Téléchargement direct de l'APK de la dernière release sans
// exposer le token GitHub au client - le serveur fait le pont avec l'API
// GitHub et streame le binaire tel quel ; l'appli le télécharge puis lance
// l'installateur Android natif (voir components/UpdateModal.tsx).
const { Readable } = require('stream');
const { fetchLatestRelease, GITHUB_TOKEN } = require('./_lib/github');

module.exports = async (req, res) => {
  if (!GITHUB_TOKEN) {
    res.status(501).json({ error: 'Téléchargement direct non configuré (GITHUB_TOKEN manquant).' });
    return;
  }
  try {
    const release = await fetchLatestRelease();
    if (!release) throw new Error('Aucune release GitHub disponible.');
    const asset = (release.assets ?? []).find((a) => a.name.endsWith('.apk'));
    if (!asset) throw new Error('Aucun APK trouvé sur cette release.');

    const assetResp = await fetch(asset.url, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/octet-stream' },
    });
    if (!assetResp.ok || !assetResp.body) throw new Error(`Téléchargement de l'APK échoué (HTTP ${assetResp.status}).`);

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${asset.name}"`);
    // Sans Content-Length, la réponse part en chunked et le téléchargement
    // côté appli (expo-file-system) ne connaît jamais totalBytes - onProgress
    // reçoit alors toujours null et la fenêtre de maj reste bloquée sur un
    // simple spinner au lieu d'afficher le pourcentage.
    res.setHeader('Content-Length', String(asset.size));
    Readable.fromWeb(assetResp.body).pipe(res);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
