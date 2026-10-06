/** Avatar colour palette — index comes from `PlayerView.color` (0..7, unique per room). */
export const AVATAR_COLORS = [
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#38bdf8", // sky
  "#84cc16", // lime
  "#fb923c", // orange
  "#fb7185", // rose
] as const;

export const avatarColor = (index: number): string => AVATAR_COLORS[((index % 8) + 8) % 8];
