/** Maps the biennial Nations League cycle to UEFA's odd-numbered ending year. */
export function getNationsleagueSeasonYear(date = new Date()) {
  const year = date.getUTCFullYear();
  return year % 2 === 1 ? year : date.getUTCMonth() >= 6 ? year + 1 : year - 1;
}

/** Keeps missing scores unknown and excludes extra time, aggregates, and shootouts. */
export function getNationsleagueRegularScore(match, side) {
  const value = match?.score?.regular?.[side];
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

export const NATIONSLEAGUE_TEAM_ALIASES = new Map([
  ["czech republic", "czechia"],
  ["turkey", "turkiye"],
  ["ireland", "republic of ireland"],
  ["slovak republic", "slovakia"],
]);
