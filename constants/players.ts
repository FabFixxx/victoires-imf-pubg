export const GROUP_PLAYERS = ['petittom', 'Nicotom', 'FabFix', 'Jibby37'] as const;
export type PlayerName = typeof GROUP_PLAYERS[number];

export function getDisplayName(player: string): string {
  if (player === 'petittom') return 'Petittom';
  return player;
}
