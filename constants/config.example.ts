// Copier ce fichier en config.ts et remplir les vraies valeurs
// DO NOT commit config.ts — it contains real API keys

export const PUBG_API_KEY = 'YOUR_PUBG_API_KEY_HERE';
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your_supabase_anon_key_here';

export const GROUP_PLAYERS = ['FabFix', 'Nicotom', 'petittom', 'Jibby37'] as const;
export type GroupPlayer = (typeof GROUP_PLAYERS)[number];

export const PUBG_BASE_URL = 'https://api.pubg.com/shards/steam';
