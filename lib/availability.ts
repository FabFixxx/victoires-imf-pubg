import { supabase } from './supabase';

export const PLAYER_COLORS: Record<string, string> = {
  FabFix: '#359bcf',
  Nicotom: '#db7334',
  petittom: '#e2e127',
  Jibby37: '#4ba157',
};

export interface DayAvailability {
  date: string; // 'YYYY-MM-DD'
  players: string[];
}

function toDateStr(val: any): string {
  return typeof val === 'string' ? val.split('T')[0] : String(val);
}

export async function getAvailability(startDate: string, endDate: string): Promise<DayAvailability[]> {
  const { data } = await supabase
    .from('player_availability')
    .select('player_username, date')
    .gte('date', startDate)
    .lte('date', endDate);

  if (!data) return [];

  const byDate: Record<string, string[]> = {};
  for (const row of data) {
    const d = toDateStr(row.date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(row.player_username);
  }

  return Object.entries(byDate).map(([date, players]) => ({ date, players }));
}

export async function toggleAvailability(username: string, date: string): Promise<boolean> {
  const { data } = await supabase
    .from('player_availability')
    .select('id')
    .eq('player_username', username)
    .eq('date', date)
    .maybeSingle();

  if (data) {
    const { error } = await supabase.from('player_availability').delete()
      .eq('player_username', username)
      .eq('date', date);
    if (error) console.error('[toggleAvailability] delete failed:', error.message);
    return false;
  } else {
    const { error } = await supabase.from('player_availability').insert({ player_username: username, date });
    if (error) console.error('[toggleAvailability] insert failed:', error.message);
    return true;
  }
}

// ── Aucune dispo ──

export async function addNoAvailability(username: string, weekStart: string): Promise<void> {
  const { error } = await supabase.from('week_no_availability').upsert(
    { player_username: username, week_start: weekStart },
    { onConflict: 'player_username,week_start' }
  );
  if (error) console.error('[addNoAvailability] failed:', error.message);
}

export async function removeNoAvailability(username: string, weekStart: string): Promise<void> {
  const { error } = await supabase.from('week_no_availability').delete()
    .eq('player_username', username)
    .eq('week_start', weekStart);
  if (error) console.error('[removeNoAvailability] failed:', error.message);
}

export async function deleteAvailabilityForWeek(username: string, weekStart: string, weekEnd: string): Promise<void> {
  const { error } = await supabase.from('player_availability').delete()
    .eq('player_username', username)
    .gte('date', weekStart)
    .lte('date', weekEnd);
  if (error) console.error('[deleteAvailabilityForWeek] failed:', error.message);
}

export async function getNoAvailability(weekStart: string): Promise<string[]> {
  const { data } = await supabase
    .from('week_no_availability')
    .select('player_username')
    .eq('week_start', weekStart);
  return (data ?? []).map((r: any) => r.player_username);
}

// ── Sessions retenues ──

export async function getRetainedSessions(weekStart: string, weekEnd: string): Promise<string[]> {
  const { data } = await supabase
    .from('notification_log')
    .select('key')
    .eq('type', 'retained_session')
    .gte('key', weekStart)
    .lte('key', weekEnd);
  return (data ?? []).map((r: any) => r.key);
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function sundayOf(mondayStr: string): string {
  const d = new Date(mondayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}

// Un seul démarquage à la fois, sans re-déclencher l'enforcement "une seule date
// retenue par semaine" (sinon addRetainedSession <-> unretainOne boucleraient).
async function unretainOne(date: string, actor: string): Promise<void> {
  const { error } = await supabase.from('notification_log').delete()
    .eq('type', 'retained_session')
    .eq('key', date);
  if (error) console.error('[unretainOne] failed:', error.message);

  await supabase.from('retained_session_log').insert({ player_username: actor, date, action: 'unretain' });

  // Debounce comme les autres notifs : planifie "Session annulée !" au lieu d'envoyer
  // tout de suite. send-reminders traitera ce pending à la prochaine heure pleine et
  // annulera l'envoi si la date a été re-retenue entre-temps (re-toggle, re-vote).
  const { error: pendingError } = await supabase.from('notification_log').upsert(
    { type: 'session_cancelled_pending', key: date, sent_at: new Date().toISOString() },
    { onConflict: 'type,key' }
  );
  if (pendingError) console.error('[unretainOne] pending schedule failed:', pendingError.message);
}

export async function addRetainedSession(date: string, actor: string): Promise<void> {
  // Une seule date retenue par semaine : démarque toute autre date déjà retenue
  // sur la même semaine (chacune reçoit sa propre notif "Session annulée !" via
  // unretainOne, comme un démarquage manuel normal) avant de marquer la nouvelle.
  // Sans ça, un retenue manuel pouvait coexister silencieusement avec le retenue
  // automatique (4 votes) d'une autre date de la même semaine - vécu en prod le
  // 21/09/2026 sur le 24 (auto) + 25 (manuel), le second sans aucune notif.
  const weekStart = mondayOf(date);
  const weekEnd = sundayOf(weekStart);
  const { data: others } = await supabase
    .from('notification_log').select('key').eq('type', 'retained_session')
    .gte('key', weekStart).lte('key', weekEnd).neq('key', date);
  for (const other of others ?? []) {
    await unretainOne(other.key, actor);
  }

  const { error } = await supabase.from('notification_log').upsert(
    { type: 'retained_session', key: date },
    { onConflict: 'type,key', ignoreDuplicates: true }
  );
  if (error) console.error('[addRetainedSession] failed:', error.message);

  await supabase.from('retained_session_log').insert({ player_username: actor, date, action: 'retain' });

  // Debounce symétrique à unretainOne : send-reminders enverra "Session retenue !"
  // à la prochaine heure pleine, et annulera si la date a été re-démarquée entre-temps.
  const { error: pendingError } = await supabase.from('notification_log').upsert(
    { type: 'session_retained_pending', key: date, sent_at: new Date().toISOString() },
    { onConflict: 'type,key' }
  );
  if (pendingError) console.error('[addRetainedSession] pending schedule failed:', pendingError.message);
}

export async function removeRetainedSession(date: string, actor: string): Promise<void> {
  await unretainOne(date, actor);
}

// ── Préférences de notifications ──

export interface NotificationPrefs {
  reminderHour: number;
  gameDayHour: number;
}

export async function getNotificationPrefs(username: string): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('reminder_hour, game_day_hour')
    .eq('player_username', username)
    .maybeSingle();
  return { reminderHour: data?.reminder_hour ?? 17, gameDayHour: data?.game_day_hour ?? 18 };
}

export async function saveNotificationPrefs(username: string, prefs: NotificationPrefs): Promise<void> {
  const { error } = await supabase.from('notification_preferences').upsert(
    { player_username: username, reminder_hour: prefs.reminderHour, game_day_hour: prefs.gameDayHour, updated_at: new Date().toISOString() },
    { onConflict: 'player_username' }
  );
  if (error) console.error('[saveNotificationPrefs] failed:', error.message);
}
