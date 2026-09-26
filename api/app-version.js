// Voir api/_lib/github.js pour le pourquoi (dépôt privé, token côté
// serveur). Repli sur app.json si l'appel GitHub échoue (offline, token
// absent, quota...) - jamais bloquant côté client (échec silencieux, voir
// lib/update-check.ts).
const fs = require('fs');
const path = require('path');
const { fetchLatestRelease } = require('./_lib/github');

const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8')).expo.version;

module.exports = async (req, res) => {
  const release = await fetchLatestRelease().catch(() => null);
  const version = release?.tag_name?.replace(/^v/, '') ?? APP_VERSION;
  res.json({ version });
};
