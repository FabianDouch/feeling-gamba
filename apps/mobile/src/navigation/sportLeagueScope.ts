export const SPORT_OPTIONS = [
  { label: "Racing", value: "racing" },
  { label: "Tennis", value: "tennis" },
  { label: "Rugby League", value: "rugby_league" },
  { label: "Rugby Union", value: "rugby_union" },
  { label: "Football", value: "football" },
  { label: "American Football", value: "american_football" },
  { label: "Combat Sports", value: "combat_sports" },
] as const;
export type SportGroup = typeof SPORT_OPTIONS[number]["value"];
export const LEAGUE_OPTIONS = {
  racing: [{ label: "Racing", value: "racing" }],
  tennis: [{ label: "All Tennis", value: "tennis" }],
  rugby_league: [{ label: "All Rugby League", value: "all_rugby_league" }, { label: "NRL", value: "nrl" }],
  rugby_union: [{ label: "All Rugby Union", value: "all_rugby_union" }, { label: "NPC", value: "npc" }],
  football: [
    { label: "All Football", value: "all_football" },
    { label: "UCL", value: "ucl" }, { label: "EPL", value: "epl" },
    { label: "La Liga", value: "laliga" }, { label: "UEFA Nations League", value: "nationsleague" },
    { label: "Bundesliga", value: "bundesliga" }, { label: "Serie A", value: "seriea" },
    { label: "Ligue 1", value: "ligue1" }, { label: "MLS", value: "mls" },
    { label: "Europa League", value: "europaleague" }, { label: "EFL Cup", value: "eflcup" },
  ],
  american_football: [{ label: "NFL", value: "nfl" }],
  combat_sports: [{ label: "All Combat Sports", value: "all_combat_sports" }, { label: "UFC", value: "ufc" }, { label: "PFL", value: "pfl" }],
} as const satisfies Record<SportGroup, readonly { label: string; value: string }[]>;
export type LeagueScope = typeof LEAGUE_OPTIONS[SportGroup][number]["value"];
export type SportScope = { group: SportGroup; league: LeagueScope };
export type SportScopeState = { group: SportGroup; leagues: Record<SportGroup, LeagueScope> };
export type PredictionLeague = "racing" | "nrl" | "npc" | "ucl" | "epl" | "laliga" | "nationsleague" | "bundesliga" | "seriea" | "ligue1" | "mls" | "ufc" | "pfl";
const PREDICTION_LEAGUES: readonly string[] = ["racing", "nrl", "npc", "ucl", "epl", "laliga", "nationsleague", "bundesliga", "seriea", "ligue1", "mls", "ufc", "pfl"];

// Start each sport at its all-league scope where available, remembering later drilldowns.
export function createSportScopeState(): SportScopeState {
  return { group: "racing", leagues: Object.fromEntries(SPORT_OPTIONS.map(({ value }) =>
    [value, LEAGUE_OPTIONS[value][0].value])) as Record<SportGroup, LeagueScope> };
}

// Reject unknown sport values without changing the user's remembered league selections.
export function selectSportGroup(state: SportScopeState, value: string): SportScopeState {
  return SPORT_OPTIONS.some((option) => option.value === value) ? { ...state, group: value as SportGroup } : state;
}

// A league selection is valid only within the active sport, preventing cross-sport fallback reads.
export function selectLeagueScope(state: SportScopeState, value: string): SportScopeState {
  return LEAGUE_OPTIONS[state.group].some((option) => option.value === value)
    ? { ...state, leagues: { ...state.leagues, [state.group]: value } } : state;
}

// Resolve the remembered league for the active sport for every participating view.
export function getSportScope(state: SportScopeState): SportScope {
  return { group: state.group, league: state.leagues[state.group] };
}

// Use the shared catalogue label in headings and explicit availability messages.
export function getLeagueLabel(league: LeagueScope): string {
  return Object.values(LEAGUE_OPTIONS).flat().find((option) => option.value === league)?.label ?? league;
}

// Route only supported prediction readers; rugby all-league scopes currently contain one league.
export function getPredictionLeague(scope: SportScope): PredictionLeague | null {
  if (scope.league === "all_rugby_league") return "nrl";
  if (scope.league === "all_rugby_union") return "npc";
  return PREDICTION_LEAGUES.includes(scope.league) ? scope.league as PredictionLeague : null;
}

// Explain unavailable readers without silently substituting another league's predictions.
export function getUnavailableScopeMessage(scope: SportScope, view: "insights" | "predictions" | "history"): string {
  const label = getLeagueLabel(scope.league);
  const content = view === "insights" ? "insights" : view === "history" ? "prediction history" : "current predictions";
  const hint = scope.league === "all_football" || scope.league === "all_combat_sports"
    ? " Choose an individual league to view its available data." : "";
  return `${label} ${content} ${view === "history" ? "is" : "are"} not available in this view yet.${hint}`;
}
