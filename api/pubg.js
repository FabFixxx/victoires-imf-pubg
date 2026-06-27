const PUBG_API_KEY = process.env.EXPO_PUBLIC_PUBG_API_KEY;
const PUBG_BASE_URL = 'https://api.pubg.com/shards/steam';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { endpoint } = req.query;
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  try {
    const response = await fetch(`${PUBG_BASE_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${PUBG_API_KEY}`,
        Accept: 'application/vnd.api+json',
      },
    });

    if (response.status === 429) {
      return res.status(429).json({ error: 'PUBG rate limit (429)' });
    }
    if (!response.ok) {
      return res.status(response.status).json({ error: `PUBG API ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
