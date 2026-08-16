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

Deno.serve(async (req) => {
  try {
    const payload = await req.json()

    // Trigger DELETE (retrait d'un vote) : nettoie retained_session si la date retenue
    // n'a plus 4 votes. Le trigger INSERT existant envoie la ligne brute (sans wrapper),
    // celui-ci envoie { event: 'DELETE', record: {...} } pour être distingué ici.
    if (payload.event === 'DELETE') {
      const oldRecord = payload.record
      if (!oldRecord?.date) return new Response('ok - no date on delete')

      const deletedDate: string = typeof oldRecord.date === 'string' ? oldRecord.date.split('T')[0] : String(oldRecord.date)

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const { data: dayRows } = await supabase.from('player_availability').select('player_username').eq('date', deletedDate)
      const playersOnDay = (dayRows ?? []).map((r: any) => r.player_username)
      const stillFour = GROUP_PLAYERS.every((p) => playersOnDay.includes(p))

      if (!stillFour) {
        // Vérifier AVANT de nettoyer si cette date était la session retenue (officielle) :
        // c'est la condition pour envoyer "Session annulée !" (pas juste un 4/4 qui redescend).
        const { data: wasRetained } = await supabase
          .from('notification_log').select('key').eq('type', 'retained_session').eq('key', deletedDate).maybeSingle()

        await supabase.from('notification_log').delete().eq('type', 'retained_session').eq('key', deletedDate)
        // Un pending "session confirmée" en cours pour cette date n'a plus lieu d'être
        await supabase.from('notification_log').delete().eq('type', 'date_4votes_pending').eq('key', deletedDate)
        // Retirer aussi la claim finale : sinon, si les 4 votes reviennent plus tard dans la
        // semaine, Check 1 la trouve déjà "notifiée" et ne planifie plus rien silencieusement.
        await supabase.from('notification_log').delete().eq('type', 'date_4votes').eq('key', deletedDate)

        if (wasRetained) {
          // Mutex : n'envoyer "Session annulée" qu'une seule fois pour cette date
          const { error: claimError } = await supabase
            .from('notification_log').insert({ type: 'session_cancelled', key: deletedDate })
          if (!claimError) {
            const remaining = playersOnDay.length
            await sendToAll(
              supabase,
              '❌ Session annulée !',
              `Attention, la session retenue du ${formatDate(deletedDate)} n'est plus possible ! (plus que ${remaining} joueur${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''}).`
            )
          }
        }
      }

      return new Response('ok - delete handled')
    }

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
      // Si déjà notifié (date_4votes = claim final posé par send-reminders) → rien à faire
      const { data: existingVote } = await supabase
        .from('notification_log').select('key').eq('type', 'date_4votes').eq('key', date).maybeSingle()
      if (existingVote) return new Response('ok - already notified for this date')

      // Planifier avec debounce : upsert pour mettre à jour sent_at si re-vote
      await supabase.from('notification_log').upsert(
        { type: 'date_4votes_pending', key: date, sent_at: new Date().toISOString() },
        { onConflict: 'type,key' }
      )
      return new Response('ok - date_4votes_pending scheduled/updated')
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

    // Vérifier qu'une notif date_4votes (confirmée ou en attente) n'existe pas déjà cette semaine
    const { data: fourVoteNotifs } = await supabase
      .from('notification_log')
      .select('key')
      .eq('type', 'date_4votes')
      .gte('key', weekStart)
      .lte('key', weekEnd)

    const { data: fourVotePending } = await supabase
      .from('notification_log')
      .select('key')
      .eq('type', 'date_4votes_pending')
      .gte('key', weekStart)
      .lte('key', weekEnd)

    if ((fourVoteNotifs?.length ?? 0) > 0 || (fourVotePending?.length ?? 0) > 0) {
      return new Response('ok - date_4votes already handled this week')
    }

    // Planifier une notification différée : le cron send-reminders l'enverra à la prochaine
    // heure pleine après (maintenant + 30 min). Upsert pour mettre à jour sent_at si re-vote.
    await supabase
      .from('notification_log')
      .upsert(
        { type: 'week_complete_pending', key: weekStart, sent_at: new Date().toISOString() },
        { onConflict: 'type,key' }
      )

    return new Response('ok - week_complete_pending scheduled/updated')
  } catch (e) {
    console.error(e)
    return new Response('error: ' + String(e), { status: 500 })
  }
})
