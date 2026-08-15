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

  // Samedi et dimanche → vérifie la semaine suivante | Lun-Ven → vérifie la semaine en cours
  const checksNextWeek = dayOfWeek === 6 || dayOfWeek === 0
  const checkWeekMonday = checksNextWeek ? fmt(nextMonday) : fmt(thisMonday)
  const checkWeekSunday = checksNextWeek ? fmt(nextWeekSunday) : fmt(thisSunday)

  return {
    hour, dayOfWeek,
    todayStr: fmt(parisDate),
    yesterdayStr: fmt(yesterday),
    nextWeekMonday: fmt(nextMonday),
    nextWeekSunday: fmt(nextWeekSunday),
    checkWeekMonday,
    checkWeekSunday,
    checksNextWeek,
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

  // Expo push (APK Android)
  const expoTokens = players.map(p => p.expo_push_token).filter(Boolean)
  console.log(`[sendPushToAll] type=${type} | ${players.length} players | ${expoTokens.length} expo tokens`)
  if (expoTokens.length) {
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expoTokens.map((token: string) => ({
        to: token, ...payload, data: { type }, channelId: 'sessions',
      }))),
    })
    console.log(`[sendPushToAll] expo push sent, status=${expoRes.status}`)
  }

  // Web push (iOS PWA + navigateurs)
  // Tous les joueurs sont éligibles au web push, pas seulement ceux sans expo token
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    const allUsernames = players.map(p => p.username)
    console.log(`[sendPushToAll] looking up web subs for: ${allUsernames.join(', ')}`)

    const { data: webSubs, error: subError } = await supabase
      .from('web_push_subscriptions')
      .select('username, endpoint, subscription')
      .in('username', allUsernames)

    if (subError) {
      console.error('[sendPushToAll] web_push_subscriptions query error:', subError.message)
    }

    console.log(`[sendPushToAll] found ${(webSubs ?? []).length} web subscriptions`)

    for (const sub of webSubs ?? []) {
      try {
        const subJson = sub.subscription as any
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth } },
          JSON.stringify(payload)
        )
        console.log(`[sendPushToAll] web push OK: ${sub.username} endpoint=${sub.endpoint.slice(0, 50)}...`)
        await supabase.from('notification_log').insert({
          type: 'web_push_sent',
          key: `${sub.username}:${type}:${new Date().toISOString().slice(0, 10)}`,
          sent_at: new Date().toISOString(),
        })
      } catch (e: any) {
        const errMsg = e?.message ?? String(e)
        const statusCode = e?.statusCode ?? e?.status ?? 'unknown'
        console.error(`[sendPushToAll] web push FAILED: ${sub.username} | status=${statusCode} | ${errMsg}`)
        await supabase.from('notification_log').insert({
          type: 'web_push_error',
          key: `${sub.username}: send failed status=${statusCode} ${errMsg}`,
          sent_at: new Date().toISOString(),
        })
      }
    }
  } else {
    console.warn('[sendPushToAll] VAPID keys not configured — skipping web push')
  }
}

function getVictoryRecapHour(_dateStr: string): number {
  return 10
}

const GROUP_PLAYERS = ['petittom', 'Nicotom', 'FabFix', 'Jibby37']

function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function groupByDate(rows: { player_username: string; date: string }[]) {
  const byDate: Record<string, string[]> = {}
  for (const row of rows) {
    const d = typeof row.date === 'string' ? row.date.split('T')[0] : String(row.date)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(row.player_username)
  }
  return Object.entries(byDate).map(([date, ps]) => ({ date, players: ps }))
}

function buildWeekCompleteNotif(fourVote: string[], threeVote: string[]): { title: string; body: string } {
  if (fourVote.length === 1) {
    return { title: '✅ Session IMF confirmée !', body: `Tout le monde est dispo le ${formatDate(fourVote[0])} !` }
  }
  if (fourVote.length > 1) {
    const dates = fourVote.map(formatDate)
    return { title: '✅ Session IMF confirmée !', body: `Plusieurs dates possibles : ${dates.join(', ')}. La date retenue est le ${dates[0]} !` }
  }
  return { title: '✅ Tout le monde a répondu !', body: `Pas de date commune à 4. Meilleures dates : ${threeVote.map(formatDate).join(', ')}. À vous de choisir !` }
}

async function setChosenDateAuto(supabase: any, weekStart: string, chosenDate: string) {
  const { data: existing } = await supabase.from('chosen_dates').select('is_manual').eq('week_start', weekStart).maybeSingle()
  if (existing?.is_manual) return
  await supabase.from('chosen_dates').upsert({ week_start: weekStart, chosen_date: chosenDate, is_manual: false }, { onConflict: 'week_start' })
}

const MAP_NAMES: Record<string, string> = {
  Baltic_Main: 'Erangel', Erangel_Main: 'Erangel',
  Desert_Main: 'Miramar',
  Savage_Main: 'Sanhok',
  DihorOtok_Main: 'Vikendi',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Kiki_Main: 'Deston',
  Neon_Main: 'Rondo',
  Chimera_Main: 'Paramo',
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { hour, dayOfWeek, todayStr, yesterdayStr, nextWeekMonday, nextWeekSunday, checkWeekMonday, checkWeekSunday, checksNextWeek } = getParisDateInfo()

  const { data: players } = await supabase.from('players').select('username, expo_push_token')
  if (!players?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  // --- PENDING WEEK_COMPLETE (différé 15 min depuis notify-on-availability) ---
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: pendingList } = await supabase
    .from('notification_log')
    .select('key, sent_at')
    .eq('type', 'week_complete_pending')
    .lt('sent_at', fifteenMinAgo)

  for (const entry of pendingList ?? []) {
    const ws = entry.key
    const we = getWeekEnd(ws)

    // Claim atomique : insert week_complete (UNIQUE constraint = mutex)
    const { error: claimError } = await supabase
      .from('notification_log')
      .insert({ type: 'week_complete', key: ws })

    // Supprimer le pending dans tous les cas (traité ou déjà claim par une autre exécution)
    await supabase.from('notification_log').delete().eq('type', 'week_complete_pending').eq('key', ws)

    if (claimError) continue // Déjà traité

    // Vérifier si date_4votes a été envoyée pendant le délai
    const { data: fourVoteNotifs } = await supabase
      .from('notification_log').select('key').eq('type', 'date_4votes').gte('key', ws).lte('key', we)

    if (fourVoteNotifs && fourVoteNotifs.length > 0) continue // date_4votes a géré la semaine

    // Fetch données fraîches et envoyer la notif
    const { data: freshRows } = await supabase
      .from('player_availability').select('player_username, date').gte('date', ws).lte('date', we)

    const weekAvail = groupByDate(freshRows ?? [])
    const fourVote = weekAvail.filter((d) => d.players.length >= GROUP_PLAYERS.length).map((d) => d.date).sort()
    const threeVote = weekAvail.filter((d) => d.players.length === GROUP_PLAYERS.length - 1).map((d) => d.date).sort()

    if (fourVote.length > 0) await setChosenDateAuto(supabase, ws, fourVote[0])
    if (fourVote.length > 0 || threeVote.length > 0) {
      const { title, body } = buildWeekCompleteNotif(fourVote, threeVote)
      await sendPushToAll(supabase, players, title, body, 'week_complete')
    }
  }

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
      // Victoires PUBG (player_match_stats)
      const { data: winRows } = await supabase
        .from('player_match_stats').select('match_id, match_date')
        .eq('is_win', true)
        .gte('match_date', start).lt('match_date', end)
      const uniqueMatchIds = [...new Set((winRows ?? []).map((r: any) => r.match_id))]
      const pubgDates = new Set((winRows ?? []).map((r: any) => r.match_date.slice(0, 10)))
      // Victoires manuelles (imf_season_wins) non couvertes par PUBG
      const { data: manualRows } = await supabase
        .from('imf_season_wins').select('id, win_date')
        .eq('win_date', yesterdayStr)
      const extraManual = (manualRows ?? []).filter((w: any) => w.win_date && !pubgDates.has(w.win_date))
      const wins = [...uniqueMatchIds.map(id => ({ id })), ...extraManual]

      if (wins?.length) {
        let mapName: string | null = null
        if (wins.length === 1) {
          // Cherche le nom de carte : d'abord dans match_cache (PUBG), sinon imf_season_wins
          const matchId = (wins[0] as any).id
          if (!String(matchId).startsWith('manual_') && matchId) {
            const { data: cacheRow } = await supabase
              .from('match_cache').select('map_name').eq('match_id', matchId).single()
            if (cacheRow?.map_name) mapName = MAP_NAMES[cacheRow.map_name] ?? cacheRow.map_name
          }
          if (!mapName) {
            const { data: manualRow } = await supabase
              .from('imf_season_wins').select('map_name').eq('win_date', yesterdayStr).limit(1).single()
            if (manualRow?.map_name) mapName = MAP_NAMES[manualRow.map_name] ?? manualRow.map_name
          }
        }
        const title = wins.length === 1 ? '🏆 Victoire IMF hier soir !' : '🏆 Victoires IMF hier soir !'
        const body = wins.length === 1
          ? `Bravo les IMF pour votre victoire sur ${mapName} hier soir !`
          : `Bravo les IMF pour vos ${wins.length} victoires hier soir !`
        await sendPushToAll(supabase, players, title, body, 'victory_recap')
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
  // On vérifie notification_log (date_4votes) plutôt que chosen_dates :
  // ainsi la notif part automatiquement les 2 jours si 2 sessions sont confirmées.
  if (dayOfWeek !== 6) {
    const { data: todayVotes } = await supabase
      .from('notification_log')
      .select('key')
      .eq('type', 'retained_session')
      .eq('key', todayStr)
      .maybeSingle()

    if (todayVotes) {
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
  // Samedi 18h+ et dimanche → vérifie semaine suivante (checkWeekMonday = nextWeekMonday)
  // Lun → Ven → vérifie semaine en cours (checkWeekMonday = thisWeekMonday)
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
      const weekWording = checksNextWeek ? 'la semaine prochaine' : 'cette semaine'
      await sendPushToAll(
        supabase,
        players.filter(p => toNotify.includes(p.username)),
        '❌ Disponibilités IMF',
        `Tu n'as pas encore renseigné tes dispos pour ${weekWording} !`,
        'dispo_reminder'
      )
      await supabase.from('notification_log').insert(logs)
      result.dispo_sent = toNotify.length
    }
  }

  return new Response(JSON.stringify(result), { status: 200 })
})
