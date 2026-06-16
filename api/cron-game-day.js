const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  // Vérifier si aujourd'hui est une date retenue
  const today = new Date().toISOString().split('T')[0];
  const { data: chosen } = await supabase
    .from('chosen_dates')
    .select('chosen_date')
    .eq('chosen_date', today)
    .maybeSingle();

  if (!chosen) {
    return res.status(200).json({ message: "Pas de session prévue aujourd'hui" });
  }

  const title = '🎮 Ce soir on joue !';
  const body = "C'est le soir de la session IMF, prépare-toi !";

  // Expo push (Android)
  const { data: players } = await supabase
    .from('players')
    .select('expo_push_token')
    .not('expo_push_token', 'is', null);

  const tokens = (players ?? []).map(p => p.expo_push_token).filter(Boolean);
  if (tokens.length > 0) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map(token => ({
        to: token, title, body, sound: 'default',
        data: { type: 'game_day' }, channelId: 'sessions',
      }))),
    });
  }

  // Web push (iOS PWA)
  const { data: webSubs } = await supabase
    .from('web_push_subscriptions')
    .select('*');

  webpush.setVapidDetails('mailto:fabien.wagner@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  await Promise.allSettled((webSubs ?? []).map(sub =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body })
    ).catch(async () => {
      await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
    })
  ));

  res.status(200).json({ today, expoSent: tokens.length, webSent: (webSubs ?? []).length });
};
