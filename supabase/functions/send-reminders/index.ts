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

  const yesterday = new Date(parisDate)
  yesterday.setDate(parisDate.getDate() - 1)

  return {
    hour,
    dayOfWeek,
    todayStr: fmt(parisDate),
    yesterdayStr: fmt(yesterday),
    nextWeekMonday: fmt(nextMonday),
    nextWeekSunday: fmt(nextWeekSunday),
  }
}

// Convertit une heure locale Paris (ex: 18) pour une date donnée en UTC ISO string
function parisLocalToUTC(dateStr: string, localHour: number): string {
  const guess = new Date(`${dateStr}T${String(localHour).padStart(2, '0')}:00:00Z`)
  const parisHourActual = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hour12: false,
  }).format(guess))
  const diff = parisHourActual - localHour
  const adjusted = new Date(guess.getTime() - diff * 3600000)
  return adjusted.toISOString()
}

async function sendPushToAll(
  supabase: ReturnType<typeof createClient>,
  players: any[],
  title: string,
  body: string,
  type: string
) {
  const payload = { title, body }

  // Expo Push (Android)
  const expoTokens = players.map(p => p.expo_push_token).filter(Boolean)
  if (expoTokens.length > 0) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        expoTokens.map((token: string) => ({
          to: token,
          ...payload,
          data: { type },
          channelId: 'sessions',
        }))
      ),
    })
  }

  // Web Push (iOS PWA) — uniquement pour les joueurs sans token Expo
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    const usernames = players.filter(p => !p.expo_push_token).map(p => p.username)
    if (usernames.length > 0) {
      const { data: webSubs } = await supabase
        .from('web_push_subscriptions')
        .select('username, endpoint, subscription')
        .in('username', usernames)

      for (const sub of webSubs ?? []) {
        try {
          const subJson = sub.subscription as any
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth } },
            JSON.stringify(payload)
          )
        } catch (e) {
          console.warn(`Web push failed for ${sub.username}:`, e)
        }
      }
    }
  }
}

// Heure pseudo-aléatoire mais déterministe pour une date donnée (10h-16h)
function getVictoryRecapHour(dateStr: string): number {
  let hash = 0
  for (const c of dateStr) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return 10 + (Math.abs(hash) % 7) // 10, 11, 12, 13, 14, 15 ou 16
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { hour, dayOfWeek, todayStr, yesterdayStr, nextWeekMonday, nextWeekSunday } = getParisDateInfo()

  const { data: players } = await supabase
    .from('players')
    .select('username, expo_push_token')

  if (!players?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('player_username, reminder_hour, game_day_hour')

  const { data: sentTodayLog } = await supabase
    .from('notification_log')
    .select('type, key')
    .gte('sent_at', todayStr + 'T00:00:00Z')

  const sentTodaySet = new Set((sentTodayLog ?? []).map((s: any) => `${s.type}:${s.key}`))

  const result: Record<string, any> = { hour, dayOfWeek }

  // --- 3. Récap victoires de la nuit (avant le skip samedi pour couvrir vendredi soir) ---
  const victoryRecapKey = `victory_recap:${todayStr}`
  if (!sentTodaySet.has(victoryRecapKey)) {
    const victoryRecapHour = getVictoryRecapHour(todayStr)
    if (hour === victoryRecapHour) {
      // Fenêtre : hier 18h Paris → aujourd'hui 6h Paris
      const windowStart = parisLocalToUTC(yesterdayStr, 18)
      const windowEnd = parisLocalToUTC(todayStr, 6)

      const { data: nightWins } = await supabase
        .from('imf_season_wins')
        .select('id, map_name, created_at')
        .gte('created_at', windowStart)
        .lt('created_at', windowEnd)

      if (nightWins && nightWins.length > 0) {
        const count = nightWins.length
        let title: string
        let body: string

        if (count === 1) {
          const mapName = nightWins[0].map_name
          title = '🏆 Victoire IMF hier soir !'
          body = mapName
            ? `Bravo les IMF, belle victoire hier soir sur ${mapName} !`
            : 'Bravo les IMF, belle victoire hier soir !'
        } else {
          title = '🏆 Victoires IMF hier soir !'
          body = `Bravo les IMF, ${count} belles victoires hier soir !`
        }

        await sendPushToAll(supabase, players, title, body, 'victory_recap')
        await supabase.from('notification_log').insert({
          type: 'victory_recap',
          key: todayStr,
          sent_at: new Date().toISOString(),
        })
        result.victory_recap_sent = count
      }
    }
    result.victory_recap_hour = getVictoryRecapHour(todayStr)
  }

  if (dayOfWeek === 6) {
    return new Response(JSON.stringify({ ...result, skipped: 'Samedi' }), { status: 200 })
  }

  // --- 1. Notif jour de jeu ---
  const { data: chosenDate } = await supabase
    .from('chosen_dates')
    .select('chosen_date')
    .eq('chosen_date', todayStr)
    .maybeSingle()

  if (chosenDate) {
    const gameDayKey = `game_day:${todayStr}`
    if (!sentTodaySet.has(gameDayKey)) {
      const gameDayHour = prefs?.find((p: any) => p.game_day_hour != null)?.game_day_hour ?? 18
      if (hour === gameDayHour) {
        await sendPushToAll(
          supabase,
          players,
          '🎮 IMF - Ce soir c\'est le soir !',
          'N\'oublies pas que ce soir on gagne ! 🏆',
          'game_day'
        )
        await supabase.from('notification_log').insert({
          type: 'game_day',
          key: todayStr,
          sent_at: new Date().toISOString(),
        })
        result.game_day_sent = true
      }
    }
  }

  // --- 2. Rappel disponibilités ---
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

  const playersToNotify: string[] = []
  const keysToLog: string[] = []

  for (const player of players) {
    if (respondedPlayers.has(player.username)) continue

    const pref = prefs?.find((p: any) => p.player_username === player.username)
    const reminderHour = pref?.reminder_hour ?? 17
    if (hour !== reminderHour) continue

    const key = `${todayStr}_${player.username}`
    if (sentTodaySet.has(`dispo_reminder:${key}`)) continue

    playersToNotify.push(player.username)
    keysToLog.push(key)
  }

  if (playersToNotify.length > 0) {
    const playersFiltered = players.filter(p => playersToNotify.includes(p.username))
    await sendPushToAll(
      supabase,
      playersFiltered,
      '❌ Disponibilités IMF',
      'Tu n\'as pas encore renseigné tes dispos pour la semaine prochaine !',
      'dispo_reminder'
    )
    await supabase.from('notification_log').insert(
      keysToLog.map(key => ({
        type: 'dispo_reminder',
        key,
        sent_at: new Date().toISOString(),
      }))
    )
    result.dispo_sent = playersToNotify.length
  }

  return new Response(JSON.stringify(result), { status: 200 })
})
