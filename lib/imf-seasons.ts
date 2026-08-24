import { supabase } from './supabase';

export interface ManualWin {
  id: string;
  mapName: string | null;
  finisher: string | null;
  winDate: string | null;
}

export interface ImfSeason {
  year: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  manualWinsDetail: ManualWin[];
}

export async function getImfSeasons(): Promise<ImfSeason[]> {
  const { data } = await supabase
    .from('imf_seasons')
    .select('*')
    .order('year', { ascending: false });

  if (!data || data.length === 0) return [];

  // Jour calendaire en heure de Paris (le groupe joue depuis la France), pas le fuseau de
  // l'appareil qui exécute le code : un joueur en déplacement à l'étranger ne doit pas voir
  // une saison différente à cause de son fuseau local (cf. toParisDateStr dans victoires.tsx).
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  const { data: winsData } = await supabase
    .from('imf_season_wins')
    .select('id, year, map_name, finisher, win_date')
    .order('created_at', { ascending: true });

  return data.map((row, idx) => {
    const nextSeason = data[idx - 1];
    let endDate: string;
    if (nextSeason) {
      // Arithmétique purement calendaire en UTC (getUTCDate/setUTCDate) : évite toute
      // dépendance au fuseau de l'appareil pour un simple "jour précédent".
      const d = new Date(nextSeason.start_date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      endDate = d.toISOString().split('T')[0];
    } else {
      endDate = today;
    }
    // La saison la plus récente (par année) n'est "en cours" que si elle a réellement
    // commencé : sans ça, pré-créer une saison future la marquerait current à tort.
    const isCurrent = row.start_date <= today && (!nextSeason || nextSeason.start_date > today);
    const manualWinsDetail: ManualWin[] = (winsData ?? [])
      .filter((w) => w.year === row.year)
      .map((w) => ({ id: w.id, mapName: w.map_name ?? null, finisher: w.finisher ?? null, winDate: w.win_date ?? null }));

    return { year: row.year, startDate: row.start_date, endDate, isCurrent, manualWinsDetail };
  });
}

export async function getCurrentImfSeason(): Promise<ImfSeason | null> {
  const seasons = await getImfSeasons();
  return seasons.find((s) => s.isCurrent) ?? seasons[0] ?? null;
}

export async function upsertImfSeason(year: number, startDate: string): Promise<void> {
  const { error } = await supabase.from('imf_seasons').upsert(
    { year, start_date: startDate },
    { onConflict: 'year' }
  );
  if (error) console.error('[upsertImfSeason] failed:', error.message);
}

export async function addManualWin(
  year: number,
  mapName: string | null,
  finisher: string | null,
  winDate: string | null
): Promise<void> {
  const { error } = await supabase.from('imf_season_wins').insert({
    year,
    map_name: mapName,
    finisher,
    win_date: winDate,
  });
  if (error) console.error('[addManualWin] failed:', error.message);
}

export async function deleteManualWin(id: string): Promise<void> {
  const { error } = await supabase.from('imf_season_wins').delete().eq('id', id);
  if (error) console.error('[deleteManualWin] failed:', error.message);
}

export async function updateManualWin(
  id: string,
  mapName: string | null,
  finisher: string | null,
  winDate: string | null
): Promise<void> {
  const { error } = await supabase.from('imf_season_wins').update({
    map_name: mapName,
    finisher,
    win_date: winDate,
  }).eq('id', id);
  if (error) console.error('[updateManualWin] failed:', error.message);
}
