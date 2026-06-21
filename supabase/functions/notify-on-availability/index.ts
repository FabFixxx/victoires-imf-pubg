import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const GROUP_PLAYERS = ['petittom', 'Nicotom', 'FabFix', 'Jibby37']

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  const daysToMonday = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + daysToMonday)
  return d.toISOString().split('T')[0]
}

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
  return Object.entries(byDate).map(([date, players]) => ({ date, players }))
}

async function sendToAll(supabase: ReturnType<typeof createClient>, title: string, body: string) {
  const { data: players } = await supabase
    .from('players')
    .select('expo_push_token')
    .not('expo_push_token', 'is', null)

  const tokens = (players ?? []).map((p: any) => p.expo_push_token).filter(Boolean)
  if (tokens.length > 0) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        tokens.map((token: string) => ({
          to: token,
          title,
          body,
          sound: 'default',
          data: { type: 'availability_update' },
          channelId: 'sessions',
        }))
      ),
    })
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails('mailto:fabien.wagner@gmail.com', vapidPublic, vapidPrivate)
    const { data: subs } = await supabase.from('web_push_subscriptions').select('*')
    for (const sub of subs ?? []) {
      try {
        const subJson = sub.subscription as any
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth } },
          JSON.stringify({ title, body })
        )
      } catch {
        await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }
}

// Définit la date retenue pour une semaine (auto, ne pas écraser une sélection manuelle)
async function setChosenDateAuto(supabase: ReturnType<typeof createClient>, weekStart: string, chosenDate: string) {
  const { data: existing } = await supabase
    .from('chosen_dates')
    .select('is_manual')
    .eq('week_start', weekStart)
    .maybeSingle()

  if (existing?.is_manual) return // Ne pas écraser un choix manuel

  await supabase.from('chosen_dates').upsert(
    { week_start: weekStart, chosen_date: chosenDate, is_manual: false },
    { onConflict: 'week_start' }
  )
}

// Construit le titre et le corps de la notification
function buildNotif(fourVote: string[], threeVote: string[]): { title: string; body: string } {
  if (fourVote.length === 1) {
    return {
      title: '✅ Session IMF confirmée !',
      body: `Tout le monde est dispo le ${formatDate(fourVote[0])} !`,
    }
  }
  if (fourVote.length > 1) {
    const [first, ...others] = fourVote.map(formatDate)
    return {
      title: '✅ Session IMF confirmée !',
      body: `Plusieurs dates possibles : ${[first, ...others].join(', ')}. La date retenue est le ${first} !`,
    }
  }
  if (threeVote.length > 0) {
    return {
      title: '✅ Tout le monde a répondu !',
      body: `Pas de date commune à 4. Meilleures dates : ${threeVote.map(formatDate).join(', ')}. À vous de choisir !`,
    }
  }
  return {
    title: '✅ Tout le monde a répondu !',
    body: 'Aucune date commune trouvée.',
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record ?? payload
    if (!record || !record.date) return new Response('no record', { status: 400 })

    const date: string = typeof record.date === 'string' ? record.date.split('T')[0] : String(record.date)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const weekStart = getWeekStart(date)
    const weekEnd = getWeekEnd(weekStart)

    // --- Check 1 : cette date a-t-elle maintenant 4 votes ? ---
    const { data: dayRows } = await supabase
      .from('player_availability')
      .select('player_username')
      .eq('date', date)

    const playersOnDay = (dayRows ?? []).map((r: any) => r.player_username)
    const allFourOnDate = GROUP_PLAYERS.every((p) => playersOnDay.includes(p))

    if (allFourOnDate) {
      const { error } = await supabase
        .from('notification_log')
        .insert({ type: 'date_4votes', key: date })

      if (!error) {
        // Chercher d'autres dates 4 votes dans la semaine
        const { data: weekRows } = await supabase
          .from('player_availability')
          .select('player_username, date')
          .gte('date', weekStart)
          .lte('date', weekEnd)

        const weekAvail = groupByDate(weekRows ?? [])
        const allFourDates = weekAvail
          .filter((d) => d.players.length === 4)
          .map((d) => d.date)
          .sort()

        // Date retenue = la plus proche parmi les dates à 4 votes
        const retenue = allFourDates[0] ?? date
        await setChosenDateAuto(supabase, weekStart, retenue)

        const { title, body } = buildNotif(allFourDates, [])
        await sendToAll(supabase, title, body)
        return new Response('ok - date_4votes notif sent')
      }
      return new Response('ok - already notified for this date')
    }

    // --- Check 2 : les 4 ont-ils tous répondu cette semaine (dispos ou aucune dispo) ? ---
    const { data: weekRows } = await supabase
      .from('player_availability')
      .select('player_username, date')
      .gte('date', weekStart)
      .lte('date', weekEnd)

    const { data: noAvailRows } = await supabase
      .from('week_no_availability')
      .select('player_username')
      .eq('week_start', weekStart)

    const respondedInWeek = new Set((weekRows ?? []).map((r: any) => r.player_username))
    const noAvailInWeek = new Set((noAvailRows ?? []).map((r: any) => r.player_username))
    const allResponded = GROUP_PLAYERS.every((p) => respondedInWeek.has(p) || noAvailInWeek.has(p))

    if (!allResponded) return new Response('ok - not all responded yet')

    // Vérifier qu'une notif date_4votes n'a pas déjà été envoyée cette semaine
    const { data: weekNotifs } = await supabase
      .from('notification_log')
      .select('key')
      .eq('type', 'date_4votes')
      .gte('key', weekStart)
      .lte('key', weekEnd)

    if (weekNotifs && weekNotifs.length > 0) {
      return new Response('ok - date_4votes already notified this week')
    }

    const { error } = await supabase
      .from('notification_log')
      .insert({ type: 'week_complete', key: weekStart })

    if (!error) {
      const weekAvail = groupByDate(weekRows ?? [])
      const fourVote = weekAvail.filter((d) => d.players.length === 4).map((d) => d.date).sort()
      const threeVote = weekAvail.filter((d) => d.players.length === 3).map((d) => d.date).sort()

      if (fourVote.length > 0) {
        await setChosenDateAuto(supabase, weekStart, fourVote[0])
      }

      const { title, body } = buildNotif(fourVote, threeVote)
      await sendToAll(supabase, title, body)
    }

    return new Response('ok')
  } catch (e) {
    console.error(e)
    return new Response('error: ' + String(e), { status: 500 })
  }
})
