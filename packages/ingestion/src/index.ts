export type IngestionSource =
  | "tab_graphql"
  | "betcha_graphql"
  | "tab_form_guide"
  | "hrnz";

export type IngestionAdapterStatus = {
  implemented: boolean;
  source: IngestionSource;
};

export const plannedAdapters: IngestionAdapterStatus[] = [
  { implemented: false, source: "tab_graphql" },
  { implemented: false, source: "betcha_graphql" },
  { implemented: false, source: "tab_form_guide" },
  { implemented: false, source: "hrnz" },
];
