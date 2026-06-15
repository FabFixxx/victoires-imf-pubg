import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const GROUP_PLAYERS = ['FabFix', 'Nicotom', 'petittom', 'Jibby37']

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay() // 0=dim, 1=lun...
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
  // Expo push (Android)
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

  // Web push (iOS PWA)
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails('mailto:fabien.wagner@gmail.com', vapidPublic, vapidPrivate)

    const { data: subs } = await supabase.from('web_push_subscriptions').select('*')
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body })
        )
      } catch {
        // Subscription expirée — on la supprime
        await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
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
        await sendToAll(supabase, '🎮 Session confirmée !', `Les 4 sont dispo le ${formatDate(date)} !`)
        return new Response('ok - date notif sent')
      }
    }

    // --- Check 2 : les 4 ont-ils tous répondu dans cette semaine (lun-dim) ? ---
    const weekStart = getWeekStart(date)
    const weekEnd = getWeekEnd(weekStart)

    const { data: weekRows } = await supabase
      .from('player_availability')
      .select('player_username, date')
      .gte('date', weekStart)
      .lte('date', weekEnd)

    const respondedInWeek = new Set((weekRows ?? []).map((r: any) => r.player_username))
    const allFourInWeek = GROUP_PLAYERS.every((p) => respondedInWeek.has(p))

    if (allFourInWeek) {
      const { error } = await supabase
        .from('notification_log')
        .insert({ type: 'week_complete', key: weekStart })
      if (!error) {
        const weekAvail = groupByDate(weekRows ?? [])
        const fourVote = weekAvail
          .filter((d) => d.players.length === 4)
          .sort((a, b) => a.date.localeCompare(b.date))
        const threeVote = weekAvail
          .filter((d) => d.players.length === 3)
          .sort((a, b) => a.date.localeCompare(b.date))
        const bestDates = fourVote.length > 0 ? fourVote : threeVote
        if (bestDates.length > 0) {
          const dateStr = bestDates.map((d) => formatDate(d.date)).join(', ')
          await sendToAll(supabase, '✅ Tout le monde a répondu !', `Meilleure(s) date(s) : ${dateStr}`)
        }
      }
    }

    return new Response('ok')
  } catch (e) {
    console.error(e)
    return new Response('error: ' + String(e), { status: 500 })
  }
})
