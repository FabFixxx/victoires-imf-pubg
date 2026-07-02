const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:fabien.wagner@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subscriptions, title, body } = req.body;

  if (!subscriptions || !Array.isArray(subscriptions)) {
    return res.status(400).json({ error: 'subscriptions required' });
  }

  const payload = JSON.stringify({ title, body });

  const results = await Promise.allSettled(
    subscriptions.map((sub) => webpush.sendNotification(sub, payload))
  );

  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => ({ message: r.reason?.message, statusCode: r.reason?.statusCode, body: r.reason?.body }));
  const failed = errors.length;
  res.status(200).json({ sent: results.length - failed, failed, errors });
};
