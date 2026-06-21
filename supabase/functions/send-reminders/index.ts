import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:fwagner@divalto.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

function getParisDateInfo() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0'
  const year = parseInt(get('year'))
  const month = parseInt(get('month'))
  const day = parseInt(get('day'))
  const hour = parseInt(get('hour'))

  const parisDate = new Date(year, month - 1, day)
  const dayOfWeek = parisDate.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  // Lundi de cette semaine (semaine Lun-Dim)
  const daysFromMonday = (dayOfWeek + 6) % 7
  const thisMonday = new Date(parisDate)
  thisMonday.setDate(parisDate.getDate() - daysFromMonday)

  // Lundi de la semaine prochaine
  const nextMonday = new Date(thisMonday)
  nextMonday.setDate(thisMonday.getDate() + 7)

  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  const nextWeekSunday = new Date(nextMonday)
  nextWeekSunday.setDate(nextMonday.getDate() + 6)

  return {
    hour,
    dayOfWeek,
    todayStr: fmt(parisDate),
    nextWeekMonday: fmt(nextMonday),
    nextWeekSunday: fmt(nextWeekSunday),
  }
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { hour, dayOfWeek, todayStr, nextWeekMonday, nextWeekSunday } = getParisDateInfo()

  // Seulement Dimanche (0) à Vendredi (5)
  if (dayOfWeek === 6) {
    return new Response(JSON.stringify({ skipped: 'Samedi' }), { status: 200 })
  }

  // Récupérer les joueurs
  const { data: players } = await supabase
    .from('players')
    .select('username, expo_push_token')

  if (!players?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  // Préférences de notification
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('player_username, reminder_hour')

  // Qui a déjà répondu pour la semaine prochaine
  const { data: availabilities } = await supabase
    .from('player_availability')
    .select('player_username')
    .gte('date', nextWeekMonday)
    .lte('date', nextWeekSunday)

  const { data: noAvails } = await supabase
    .from('week_no_availability')
    .select('player_username')
    .eq('week_start', nextWeekMonday)

  const respondedPlayers = new Set([
    ...(availabilities ?? []).map((a: any) => a.player_username),
    ...(noAvails ?? []).map((a: any) => a.player_username),
  ])

  // Notifications déjà envoyées aujourd'hui
  const { data: sentToday } = await supabase
    .from('notification_log')
    .select('key')
    .eq('type', 'dispo_reminder')
    .gte('sent_at', todayStr + 'T00:00:00Z')

  const sentKeys = new Set((sentToday ?? []).map((s: any) => s.key))

  // Joueurs qui doivent recevoir une notif cette heure-ci
  const playersToNotify: string[] = []
  const keysToLog: string[] = []

  for (const player of players) {
    if (respondedPlayers.has(player.username)) continue

    const pref = prefs?.find((p: any) => p.player_username === player.username)
    const reminderHour = pref?.reminder_hour ?? 17
    if (hour !== reminderHour) continue

    const key = `${todayStr}_${player.username}`
    if (sentKeys.has(key)) continue

    playersToNotify.push(player.username)
    keysToLog.push(key)
  }

  if (playersToNotify.length === 0) {
    return new Response(JSON.stringify({ sent: 0, hour, dayOfWeek }), { status: 200 })
  }

  const notifPayload = {
    title: '🎮 Victoires IMF',
    body: 'Renseigne tes disponibilités pour la semaine prochaine !',
  }

  // Expo Push (Android)
  const expoTokens = players
    .filter(p => playersToNotify.includes(p.username) && p.expo_push_token)
    .map(p => p.expo_push_token)

  if (expoTokens.length > 0) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        expoTokens.map(token => ({
          to: token,
          ...notifPayload,
          data: { type: 'dispo_reminder' },
          channelId: 'sessions',
        }))
      ),
    })
  }

  // Web Push (iOS PWA) — uniquement pour les joueurs sans token Expo
  const playersWithoutExpoToken = playersToNotify.filter(
    u => !players.find(p => p.username === u)?.expo_push_token
  )

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && playersWithoutExpoToken.length > 0) {
    const { data: webSubs } = await supabase
      .from('web_push_subscriptions')
      .select('username, endpoint, subscription')
      .in('username', playersWithoutExpoToken)

    for (const sub of webSubs ?? []) {
      try {
        const subJson = sub.subscription as any
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh,
              auth: subJson.keys?.auth,
            },
          },
          JSON.stringify(notifPayload)
        )
      } catch (e) {
        console.warn(`Web push failed for ${sub.username}:`, e)
      }
    }
  }

  // Log des notifications envoyées
  await supabase.from('notification_log').insert(
    keysToLog.map(key => ({
      type: 'dispo_reminder',
      key,
      sent_at: new Date().toISOString(),
    }))
  )

  return new Response(JSON.stringify({ sent: playersToNotify.length, players: keysToLog, hour, dayOfWeek }), { status: 200 })
})
