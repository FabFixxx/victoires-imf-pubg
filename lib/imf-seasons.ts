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

  const today = new Date().toISOString().split('T')[0];

  const { data: winsData } = await supabase
    .from('imf_season_wins')
    .select('id, year, map_name, finisher, win_date')
    .order('created_at', { ascending: true });

  return data.map((row, idx) => {
    const nextSeason = data[idx - 1];
    let endDate: string;
    if (nextSeason) {
      const d = new Date(nextSeason.start_date);
      d.setDate(d.getDate() - 1);
      endDate = d.toISOString().split('T')[0];
    } else {
      endDate = today;
    }
    const isCurrent = !nextSeason || nextSeason.start_date > today;
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

export async function getImfSeasonForYear(year: number): Promise<ImfSeason | null> {
  const seasons = await getImfSeasons();
  return seasons.find((s) => s.year === year) ?? null;
}

export async function upsertImfSeason(year: number, startDate: string): Promise<void> {
  await supabase.from('imf_seasons').upsert(
    { year, start_date: startDate },
    { onConflict: 'year' }
  );
}

export async function deleteImfSeason(year: number): Promise<void> {
  await supabase.from('imf_seasons').delete().eq('year', year);
}

export async function getManualWins(year: number): Promise<ManualWin[]> {
  const { data } = await supabase
    .from('imf_season_wins')
    .select('id, map_name, finisher, win_date')
    .eq('year', year)
    .order('created_at', { ascending: true });
  return (data ?? []).map((w) => ({ id: w.id, mapName: w.map_name ?? null, finisher: w.finisher ?? null, winDate: w.win_date ?? null }));
}

export async function addManualWin(
  year: number,
  mapName: string | null,
  finisher: string | null,
  winDate: string | null
): Promise<void> {
  await supabase.from('imf_season_wins').insert({
    year,
    map_name: mapName,
    finisher,
    win_date: winDate,
  });
}

export async function deleteManualWin(id: string): Promise<void> {
  await supabase.from('imf_season_wins').delete().eq('id', id);
}
