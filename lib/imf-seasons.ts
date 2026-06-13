import { supabase } from './supabase';

export interface ImfSeason {
  year: number;
  startDate: string; // ISO date 'YYYY-MM-DD'
  endDate: string;   // exclusive: start of next season or today
  isCurrent: boolean;
  manualWins?: number; // override manuel des victoires groupe
}

export async function getImfSeasons(): Promise<ImfSeason[]> {
  const { data } = await supabase
    .from('imf_seasons')
    .select('*')
    .order('year', { ascending: false });

  if (!data || data.length === 0) return [];

  const today = new Date().toISOString().split('T')[0];

  return data.map((row, idx) => {
    const nextSeason = data[idx - 1]; // data est trié desc, donc idx-1 = année suivante
    let endDate: string;
    if (nextSeason) {
      const d = new Date(nextSeason.start_date);
      d.setDate(d.getDate() - 1);
      endDate = d.toISOString().split('T')[0];
    } else {
      endDate = today;
    }
    const isCurrent = !nextSeason || nextSeason.start_date > today;
    return {
      year: row.year,
      startDate: row.start_date,
      endDate,
      isCurrent,
      manualWins: row.manual_wins ?? undefined,
    };
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

export async function setManualWins(year: number, wins: number | null): Promise<void> {
  await supabase.from('imf_seasons').update({ manual_wins: wins }).eq('year', year);
}
