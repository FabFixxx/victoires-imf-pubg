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

  const daysFromMonday = (dayOfWeek + 6) % 7
  const thisMonday = new Date(parisDate)
  thisMonday.setDate(parisDate.getDate() - daysFromMonday)

  const thisSunday = new Date(thisMonday)
  thisSunday.setDate(thisMonday.getDate() + 6)

  const nextMonday = new Date(thisMonday)
  nextMonday.setDate(thisMonday.getDate() + 7)

  const nextWeekSunday = new Date(nextMonday)
  nextWeekSunday.setDate(nextMonday.getDate() + 6)

  const yesterday = new Date(parisDate)
  yesterday.setDate(parisDate.getDate() - 1)

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  // Samedi → vérifie la semaine suivante | Dim-Ven → vérifie la semaine en cours
  const checkWeekMonday = dayOfWeek === 6 ? fmt(nextMonday) : fmt(thisMonday)
  const checkWeekSunday = dayOfWeek === 6 ? fmt(nextWeekSunday) : fmt(thisSunday)

  return {
    hour, dayOfWeek,
    todayStr: fmt(parisDate),
    yesterdayStr: fmt(yesterday),
    nextWeekMonday: fmt(nextMonday),
    nextWeekSunday: fmt(nextWeekSunday),
    checkWeekMonday,
    checkWeekSunday,
  }
}

function parisLocalToUTC(dateStr: string, localHour: number): string {
  const guess = new Date(`${dateStr}T${String(localHour).padStart(2,'0')}:00:00Z`)
  const parisHourActual = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
  }).format(guess))
  const diff = parisHourActual - localHour
  return new Date(guess.getTime() - diff * 3600000).toISOString()
}

async function sendPushToAll(supabase: any, players: any[], title: string, body: string, type: string) {
  const payload = { title, body }

  const expoTokens = players.map(p => p.expo_push_token).filter(Boolean)
  if (expoTokens.length) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expoTokens.map((token: string) => ({
        to: token, ...payload, data: { type }, channelId: 'sessions',
      }))),
    })
  }

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    const usernames = players.filter(p => !p.expo_push_token).map(p => p.username)
    if (usernames.length) {
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
          console.warn('web push failed', sub.username)
        }
      }
    }
  }
}

function getVictoryRecapHour(dateStr: string): number {
  let hash = 0
  for (const c of dateStr) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return 10 + (Math.abs(hash) % 7)
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { hour, dayOfWeek, todayStr, yesterdayStr, nextWeekMonday, nextWeekSunday, checkWeekMonday, checkWeekSunday } = getParisDateInfo()

  const { data: players } = await supabase.from('players').select('username, expo_push_token')
  if (!players?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('player_username, reminder_hour, game_day_hour')

  const { data: sentTodayLog } = await supabase
    .from('notification_log')
    .select('type, key')
    .gte('sent_at', todayStr + 'T00:00:00Z')

  const sentTodaySet = new Set((sentTodayLog ?? []).map((s: any) => `${s.type}:${s.key}`))

  const result: any = { hour, dayOfWeek, checkWeekMonday, checkWeekSunday }

  // --- RECAP VICTOIRES (tous les jours) ---
  const victoryKey = `victory_recap:${todayStr}`
  if (!sentTodaySet.has(victoryKey)) {
    const victoryHour = getVictoryRecapHour(todayStr)
    if (hour === victoryHour) {
      const start = new Date(new Date(parisLocalToUTC(yesterdayStr, 6)).getTime() + 60000).toISOString()
      const end = parisLocalToUTC(todayStr, 6)
      const { data: wins } = await supabase
        .from('imf_season_wins').select('id, map_name')
        .gte('created_at', start).lt('created_at', end)

      if (wins?.length) {
        await sendPushToAll(
          supabase, players,
          wins.length === 1 ? '🏆 Victoire IMF hier soir !' : '🏆 Victoires IMF hier soir !',
          wins.length === 1 ? 'Bravo les IMF !' : `Bravo les IMF, ${wins.length} victoires !`,
          'victory_recap'
        )
        await supabase.from('notification_log').insert({
          type: 'victory_recap', key: todayStr, sent_at: new Date().toISOString(),
        })
        result.victory_recap_sent = wins.length
      }
    }
    result.victory_recap_hour = victoryHour
  }

  // --- SAMEDI AVANT 18H : stop (pas de jeu ni rappel dispo) ---
  if (dayOfWeek === 6 && hour < 18) {
    return new Response(JSON.stringify({ ...result, skipped: 'samedi avant 18h' }), { status: 200 })
  }

  // --- JOUR DE JEU (pas le samedi) ---
  if (dayOfWeek !== 6) {
    const { data: chosenDate } = await supabase
      .from('chosen_dates').select('chosen_date')
      .eq('chosen_date', todayStr).maybeSingle()

    if (chosenDate) {
      const key = `game_day:${todayStr}`
      if (!sentTodaySet.has(key)) {
        const gameHour = prefs?.find((p: any) => p.game_day_hour != null)?.game_day_hour ?? 18
        if (hour === gameHour) {
          await sendPushToAll(supabase, players,
            `🎮 IMF - Ce soir c'est le soir !`,
            `N'oublies pas que ce soir on gagne ! 🏆`,
            'game_day'
          )
          await supabase.from('notification_log').insert({
            type: 'game_day', key: todayStr, sent_at: new Date().toISOString(),
          })
          result.game_day_sent = true
        }
      }
    }
  }

  // --- RAPPEL DISPONIBILITES ---
  // Samedi 18h+ → vérifie semaine suivante (checkWeekMonday = nextWeekMonday)
  // Dim → Ven → vérifie semaine en cours (checkWeekMonday = thisWeekMonday)
  {
    const { data: availabilities } = await supabase
      .from('player_availability').select('player_username')
      .gte('date', checkWeekMonday).lte('date', checkWeekSunday)

    const { data: noAvails } = await supabase
      .from('week_no_availability').select('player_username')
      .eq('week_start', checkWeekMonday)

    const answered = new Set([
      ...(availabilities ?? []).map((a: any) => a.player_username),
      ...(noAvails ?? []).map((a: any) => a.player_username),
    ])

    const toNotify: string[] = []
    const logs: any[] = []

    for (const player of players) {
      if (answered.has(player.username)) continue

      const pref = prefs?.find((p: any) => p.player_username === player.username)
      const remindHour = dayOfWeek === 6 ? 18 : (pref?.reminder_hour ?? 17)
      if (hour !== remindHour) continue

      const key = `${todayStr}_${player.username}`
      if (sentTodaySet.has(`dispo_reminder:${key}`)) continue

      toNotify.push(player.username)
      logs.push({ type: 'dispo_reminder', key, sent_at: new Date().toISOString() })
    }

    if (toNotify.length) {
      await sendPushToAll(
        supabase,
        players.filter(p => toNotify.includes(p.username)),
        '❌ Disponibilités IMF',
        `Tu n'as pas encore renseigné tes dispos pour la semaine prochaine !`,
        'dispo_reminder'
      )
      await supabase.from('notification_log').insert(logs)
      result.dispo_sent = toNotify.length
    }
  }

  return new Response(JSON.stringify(result), { status: 200 })
})
