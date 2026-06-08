export const DS = {
  bg:      "#181818",
  yellow:  "#f5e642",
  safe:    "#8bf542",
  caution: "#f5c842",
  danger:  "#f54242",
  stroke:  "#000",
  shadow:  "3px 3px 0 #333",
  border:  "2px solid #333333",
  font:    "'Space Mono', monospace",
  textDim: "#555",
  textMut: "#888",
} as const;

export const brutal = (bg: string = DS.yellow): string =>
  `background:${bg};border:2px solid ${DS.stroke};box-shadow:${DS.shadow};border-radius:0`;

export function safetyColor(score: number): string {
  if (score >= 80) return DS.safe;
  if (score >= 50) return DS.caution;
  return DS.danger;
}
