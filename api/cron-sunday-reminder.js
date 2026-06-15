const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  'mailto:fabien.wagner@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // Vercel vérifie l'Authorization pour les crons
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const { data: subs, error } = await supabase
    .from('web_push_subscriptions')
    .select('*');

  if (error) return res.status(500).json({ error: error.message });

  const title = '🎮 Victoires IMF';
  const body = 'Renseigne tes disponibilités pour la semaine !';

  const results = await Promise.allSettled(
    (subs ?? []).map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body })
      ).catch(async () => {
        // Subscription expirée — on la supprime
        await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
      })
    )
  );

  res.status(200).json({ sent: results.filter((r) => r.status === 'fulfilled').length });
};
