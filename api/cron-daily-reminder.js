const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const GROUP_PLAYERS = ['petittom', 'Nicotom', 'FabFix', 'Jibby37'];

function getNextWeekRange() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=dim
  const daysToNextMonday = day === 0 ? 1 : 8 - day;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysToNextMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  const nextSunday = new Date(nextMonday);
  nextSunday.setUTCDate(nextMonday.getUTCDate() + 6);
  return {
    weekStart: nextMonday.toISOString().split('T')[0],
    weekEnd: nextSunday.toISOString().split('T')[0],
  };
}

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  const { weekStart, weekEnd } = getNextWeekRange();

  // Joueurs ayant répondu pour la semaine prochaine (dispo ou aucune dispo)
  const [{ data: availRows }, { data: noAvailRows }] = await Promise.all([
    supabase.from('player_availability').select('player_username').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('week_no_availability').select('player_username').eq('week_start', weekStart),
  ]);

  const responded = new Set([
    ...(availRows ?? []).map(r => r.player_username),
    ...(noAvailRows ?? []).map(r => r.player_username),
  ]);

  const pending = GROUP_PLAYERS.filter(p => !responded.has(p));
  if (pending.length === 0) {
    return res.status(200).json({ message: 'Tout le monde a répondu, pas de rappel nécessaire' });
  }

  const title = '📅 Victoires IMF';
  const body = 'Renseigne tes disponibilités pour la semaine prochaine !';

  // Expo push (Android)
  const { data: players } = await supabase
    .from('players')
    .select('username, expo_push_token')
    .in('username', pending)
    .not('expo_push_token', 'is', null);

  const tokens = (players ?? []).map(p => p.expo_push_token).filter(Boolean);
  if (tokens.length > 0) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map(token => ({
        to: token, title, body, sound: 'default',
        data: { type: 'reminder' }, channelId: 'sessions',
      }))),
    });
  }

  // Web push (iOS PWA)
  const { data: webSubs } = await supabase
    .from('web_push_subscriptions')
    .select('*')
    .in('player_username', pending);

  webpush.setVapidDetails('mailto:fabien.wagner@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  await Promise.allSettled((webSubs ?? []).map(sub =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body })
    ).catch(async () => {
      await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
    })
  ));

  res.status(200).json({ pending, expoSent: tokens.length, webSent: (webSubs ?? []).length });
};
