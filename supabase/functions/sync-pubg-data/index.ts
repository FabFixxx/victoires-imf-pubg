import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUBG_API_KEY = Deno.env.get('PUBG_API_KEY')!
const PUBG_BASE = 'https://api.pubg.com/shards/steam'

const RATE_LIMIT_DELAY = 6200
const MAX_MATCHES_PER_RUN = 30
const LOCK_TIMEOUT_MINUTES = 10

const GROUP_PLAYERS = ['petittom', 'Nicotom', 'FabFix', 'Jibby37']

const PUBG_MAP_NAMES: Record<string, string> = {
  Baltic_Main: 'Erangel', Erangel_Main: 'Erangel',
  Desert_Main: 'Miramar',
  Savage_Main: 'Sanhok', Heaven_Main: 'Sanhok',
  DihorOtok_Main: 'Vikendi',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Kiki_Main: 'Deston',
  Neon_Main: 'Rondo',
  Chimera_Main: 'Paramo',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchPUBG(endpoint: string, retries = 1): Promise<any> {
  const res = await fetch(`${PUBG_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${PUBG_API_KEY}`, Accept: 'application/vnd.api+json' },
  })
  if (res.status === 429) {
    if (retries > 0) {
      await sleep(RATE_LIMIT_DELAY)
      return fetchPUBG(endpoint, retries - 1)
    }
    throw new Error('Rate limit PUBG')
  }
  if (!res.ok) throw new Error(`PUBG API ${res.status}: ${endpoint}`)
  return res.json()
}

async function fetchFinisher(telemetryUrl: string): Promise<string | null> {
  try {
    const res = await fetch(telemetryUrl)
    if (!res.ok) return null
    const events: any[] = await res.json()
    const killEvents = events.filter((e) => e._T === 'LogPlayerKillV2' || e._T === 'LogPlayerKill')
    if (killEvents.length === 0) return null
    killEvents.sort((a, b) => a._D.localeCompare(b._D))
    const lastKill = killEvents[killEvents.length - 1]
    const finisherName = lastKill.finisher?.name ?? lastKill.killer?.name
    const victimName = lastKill.victim?.name
    if (finisherName && finisherName !== victimName) return finisherName
    const isBlueZone =
      lastKill.damageCauserName === 'BlueZone' ||
      lastKill.damageTypeCategory === 'Damage_BlueZone' ||
      lastKill.finishDamageInfo?.damageCauserName === 'BlueZone' ||
      (!finisherName && !lastKill.killer?.name)
    if (isBlueZone) return 'Zone bleue'
    const validKills = killEvents.filter((e) => {
      const fn = e.finisher?.name ?? e.killer?.name
      return fn && fn !== e.victim?.name
    })
    if (validKills.length === 0) return null
    const lastValid = validKills[validKills.length - 1]
    return lastValid.finisher?.name ?? lastValid.killer?.name ?? null
  } catch {
    return null
  }
}

async function resolvePlayerIds(supabase: any): Promise<{ ids: Record<string, string>; calledApi: boolean }> {
  const { data: cached } = await supabase
    .from('players')
    .select('username, pubg_account_id')
    .in('username', GROUP_PLAYERS)
    .not('pubg_account_id', 'is', null)

  if (cached && cached.length === GROUP_PLAYERS.length) {
    return { ids: Object.fromEntries(cached.map((p: any) => [p.username, p.pubg_account_id])), calledApi: false }
  }

  const names = GROUP_PLAYERS.join(',')
  const data = await fetchPUBG(`/players?filter[playerNames]=${names}`)
  const ids: Record<string, string> = {}
  for (const player of data.data) ids[player.attributes.name] = player.id

  await supabase.from('players').upsert(
    Object.entries(ids).map(([username, pubg_account_id]) => ({ username, pubg_account_id })),
    { onConflict: 'username' }
  )
  return { ids, calledApi: true }
}

async function fetchAndCacheMatch(
  supabase: any,
  matchId: string,
  playerIdToName: Record<string, string>,
  log: (msg: string) => void,
): Promise<boolean | null> {
  const { data: cached } = await supabase
    .from('match_cache')
    .select('data, map_name, finisher')
    .eq('match_id', matchId)
    .single()

  const cachedPlayers: any[] | undefined = Array.isArray(cached?.data?.players) ? cached.data.players : undefined
  if (cached?.map_name && cachedPlayers) {
    const isWin = cachedPlayers.some((p) => GROUP_PLAYERS.includes(p.name) && p.winPlace === 1)
    const groupPresent = cachedPlayers.filter((p) => GROUP_PLAYERS.includes(p.name)).length === GROUP_PLAYERS.length
    if (!groupPresent || !isWin || cached.finisher) return null // already complete, skip
  }

  try {
    const raw = await fetchPUBG(`/matches/${matchId}`)
    const gameMode: string = raw.data.attributes.gameMode
    const mapName: string = raw.data.attributes.mapName ?? ''

    if (cached) {
      const participants = (raw.included as any[]).filter((i: any) => i.type === 'participant')
      const groupPlayers = participants.filter((p: any) => {
        const canonical = playerIdToName[p.attributes.stats.playerId] ?? p.attributes.stats.name
        return GROUP_PLAYERS.includes(canonical)
      })
      const isGroupComplete = groupPlayers.length === GROUP_PLAYERS.length
      const isGroupWin = isGroupComplete && groupPlayers.some((p: any) => p.attributes.stats.winPlace === 1)

      const matchData = (cached.data as any) ?? {
        matchId,
        matchDate: raw.data.attributes.createdAt,
        gameMode,
        players: participants.map((p: any) => ({
          accountId: p.attributes.stats.playerId,
          name: playerIdToName[p.attributes.stats.playerId] ?? p.attributes.stats.name,
          kills: p.attributes.stats.kills,
          assists: p.attributes.stats.assists,
          damageDealt: p.attributes.stats.damageDealt,
          winPlace: p.attributes.stats.winPlace,
        })),
      }

      let finisher = cached.finisher ?? null
      if (isGroupWin && !finisher) {
        const telemetryAsset = (raw.included as any[]).find(
          (i: any) => i.type === 'asset' && i.attributes?.name === 'telemetry'
        )
        if (telemetryAsset?.attributes?.URL) finisher = await fetchFinisher(telemetryAsset.attributes.URL)
      }

      await supabase.from('match_cache').update({ map_name: mapName || null, finisher, data: matchData }).eq('match_id', matchId)
      if (!isGroupComplete) return null

      await supabase.from('player_match_stats').upsert(
        groupPlayers.map((p: any) => ({
          match_id: matchId,
          player_username: playerIdToName[p.attributes.stats.playerId] ?? p.attributes.stats.name,
          kills: p.attributes.stats.kills,
          assists: p.attributes.stats.assists,
          damage: p.attributes.stats.damageDealt,
          win_place: p.attributes.stats.winPlace,
          is_win: p.attributes.stats.winPlace === 1,
          match_date: matchData.matchDate,
        })),
        { onConflict: 'match_id,player_username' }
      )
      return true
    }

    if (!gameMode.includes('fpp')) {
      // Marque le match comme traité (avec un `data` complet : la colonne est NOT NULL)
      // pour ne pas le refetch à chaque run.
      const nonFppParticipants = (raw.included as any[]).filter((i: any) => i.type === 'participant')
      const nonFppMatchData = {
        matchId,
        matchDate: raw.data.attributes.createdAt,
        gameMode,
        players: nonFppParticipants.map((p: any) => ({
          accountId: p.attributes.stats.playerId,
          name: playerIdToName[p.attributes.stats.playerId] ?? p.attributes.stats.name,
          kills: p.attributes.stats.kills,
          assists: p.attributes.stats.assists,
          damageDealt: p.attributes.stats.damageDealt,
          winPlace: p.attributes.stats.winPlace,
        })),
      }
      await supabase.from('match_cache').upsert(
        { match_id: matchId, match_date: nonFppMatchData.matchDate, game_mode: gameMode, map_name: (PUBG_MAP_NAMES[mapName] ?? mapName) || null, data: nonFppMatchData },
        { onConflict: 'match_id', ignoreDuplicates: true }
      )
      return null
    }

    const participants = (raw.included as any[]).filter((i: any) => i.type === 'participant')
    const players = participants.map((p: any) => ({
      accountId: p.attributes.stats.playerId,
      name: playerIdToName[p.attributes.stats.playerId] ?? p.attributes.stats.name,
      kills: p.attributes.stats.kills,
      assists: p.attributes.stats.assists,
      damageDealt: p.attributes.stats.damageDealt,
      winPlace: p.attributes.stats.winPlace,
    }))

    const matchData = { matchId, matchDate: raw.data.attributes.createdAt, gameMode, players }
    const groupPlayers = players.filter((p: any) => GROUP_PLAYERS.includes(p.name))
    const isGroupWin = groupPlayers.length === GROUP_PLAYERS.length && groupPlayers.some((p: any) => p.winPlace === 1)

    let finisher: string | null = null
    if (isGroupWin) {
      const telemetryAsset = (raw.included as any[]).find(
        (i: any) => i.type === 'asset' && i.attributes?.name === 'telemetry'
      )
      if (telemetryAsset?.attributes?.URL) finisher = await fetchFinisher(telemetryAsset.attributes.URL)
    }

    await supabase.from('match_cache').upsert(
      { match_id: matchId, match_date: matchData.matchDate, game_mode: gameMode, map_name: (PUBG_MAP_NAMES[mapName] ?? mapName) || null, finisher, data: matchData },
      { onConflict: 'match_id', ignoreDuplicates: true }
    )

    if (groupPlayers.length !== GROUP_PLAYERS.length) return null

    await supabase.from('player_match_stats').upsert(
      groupPlayers.map((p: any) => ({
        match_id: matchId,
        player_username: p.name,
        kills: p.kills,
        assists: p.assists,
        damage: p.damageDealt,
        win_place: p.winPlace,
        is_win: p.winPlace === 1,
        match_date: matchData.matchDate,
      })),
      { onConflict: 'match_id,player_username' }
    )
    return true
  } catch (e: any) {
    log(`  ↳ erreur API match ${matchId}: ${e?.message ?? e}`)
    return false
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const body = await req.json().catch(() => ({}))
  const triggeredBy = body?.triggered_by === 'cron' ? 'cron' : 'manual'

  // Créer l'entrée de log (status=running) AVANT de vérifier le verrou : réserve notre
  // place immédiatement pour fermer la fenêtre de course entre deux invocations quasi
  // simultanées (check-then-insert laisserait les deux passer le check avant que l'une
  // n'insère sa ligne).
  const { data: logEntry } = await supabase
    .from('sync_log')
    .insert({ status: 'running', triggered_by: triggeredBy })
    .select('id')
    .single()
  const logId = logEntry?.id

  if (!logId) {
    // Impossible de poser notre verrou (erreur DB transitoire) : on abandonne plutôt que
    // de tourner sans aucune protection contre une synchro concurrente.
    return new Response(JSON.stringify({ error: 'could not acquire sync lock' }), { status: 500, headers: CORS })
  }

  // Lock : skip si une AUTRE sync tourne déjà et a démarré avant nous (il y a moins de
  // LOCK_TIMEOUT_MINUTES). On compare par id (BIGINT séquentiel, jamais d'égalité possible)
  // plutôt que par started_at : deux inserts quasi simultanés peuvent partager le même
  // timestamp, ce qui ferait échouer un tie-break basé sur la date pour les deux à la fois.
  const { data: running } = await supabase
    .from('sync_log')
    .select('id, started_at')
    .eq('status', 'running')
    .lt('id', logId)
    .gte('started_at', new Date(Date.now() - LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString())
    .limit(1)

  if (running && running.length > 0) {
    await supabase.from('sync_log').update({
      status: 'skipped',
      finished_at: new Date().toISOString(),
      error_msg: 'another sync already running',
    }).eq('id', logId)
    return new Response(JSON.stringify({ status: 'skipped', skipped: 'sync already running', since: running[0].started_at }), { status: 200, headers: CORS })
  }

  const logs: string[] = []
  const log = (msg: string) => { logs.push(msg); console.log(msg) }

  let matchesNew = 0
  let matchesSaved = 0
  let errorMsg: string | null = null

  try {
    log('Récupération des IDs joueurs...')
    const { ids: accountIds, calledApi: playerApiCalled } = await resolvePlayerIds(supabase)
    log(`${Object.keys(accountIds).length} joueurs trouvés`)
    if (playerApiCalled) await sleep(RATE_LIMIT_DELAY)

    const playerIdToName: Record<string, string> = Object.fromEntries(
      Object.entries(accountIds).map(([name, id]) => [id, name])
    )

    log('Récupération des matchs IMF...')
    const referenceId = accountIds['Jibby37']
    const data = await fetchPUBG(`/players/${referenceId}`)
    const allMatchIds: string[] = data.data.relationships.matches.data.map((m: any) => m.id)

    const { data: cachedRows } = await supabase
      .from('match_cache')
      .select('match_id, map_name, finisher')
      .in('match_id', allMatchIds)

    const { data: winRows } = await supabase
      .from('player_match_stats')
      .select('match_id')
      .eq('is_win', true)
      .in('match_id', allMatchIds)

    const winMatchIds = new Set((winRows ?? []).map((r: any) => r.match_id))
    const cachedComplete = new Set(
      (cachedRows ?? [])
        .filter((m: any) => m.map_name && (m.finisher || !winMatchIds.has(m.match_id)))
        .map((m: any) => m.match_id)
    )

    const newIds = allMatchIds.filter((id) => !cachedComplete.has(id))
    matchesNew = newIds.length

    if (newIds.length === 0) {
      log('Tout est à jour !')
    } else {
      await sleep(RATE_LIMIT_DELAY)
      log(`${newIds.length} nouveau${newIds.length > 1 ? 'x' : ''} match${newIds.length > 1 ? 's' : ''} à synchroniser...`)
      let consecutiveErrors = 0

      for (let i = 0; i < Math.min(newIds.length, MAX_MATCHES_PER_RUN); i++) {
        const result = await fetchAndCacheMatch(supabase, newIds[i], playerIdToName, log)
        if (result === true) { matchesSaved++; consecutiveErrors = 0 }
        else if (result === false) {
          consecutiveErrors++
          if (consecutiveErrors >= 2) {
            log('Rate limit PUBG — sync stoppée')
            break
          }
        } else {
          consecutiveErrors = 0
        }
        if (i < Math.min(newIds.length, MAX_MATCHES_PER_RUN) - 1) await sleep(RATE_LIMIT_DELAY)
      }

      if (matchesSaved > 0) {
        log(`Synchronisation terminée ! ${matchesSaved} match${matchesSaved > 1 ? 's' : ''} ajouté${matchesSaved > 1 ? 's' : ''}.`)
      } else {
        log('Aucun nouveau match IMF trouvé.')
      }
    }

    if (logId) {
      await supabase.from('sync_log').update({
        status: 'success',
        finished_at: new Date().toISOString(),
        matches_new: matchesNew,
        matches_saved: matchesSaved,
      }).eq('id', logId)
    }

    return new Response(JSON.stringify({ status: 'success', matchesNew, matchesSaved, logs }), { status: 200, headers: CORS })
  } catch (e: any) {
    errorMsg = e?.message ?? String(e)
    log(`Erreur : ${errorMsg}`)

    if (logId) {
      await supabase.from('sync_log').update({
        status: 'error',
        finished_at: new Date().toISOString(),
        matches_new: matchesNew,
        matches_saved: matchesSaved,
        error_msg: errorMsg,
      }).eq('id', logId)
    }

    return new Response(JSON.stringify({ status: 'error', error: errorMsg, logs }), { status: 500, headers: CORS })
  }
})
