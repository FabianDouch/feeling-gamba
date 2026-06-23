# Pilot Tracks

## Context

The MVP should start with a constrained track list before expanding to every domestic NZ race. This keeps source discovery, ID mapping, and result parsing manageable while still covering thoroughbred, harness, and greyhound workflows.

## Track List

| Track | Country | Expected code | Notes |
| --- | --- | --- | --- |
| Ellerslie | NZ | Thoroughbred | Major Auckland thoroughbred venue. |
| New Plymouth | NZ | Thoroughbred | May appear with variants such as `New Plymouth Raceway` or `Pukekura Raceway` in source data. |
| Te Rapa | NZ | Thoroughbred | Waikato thoroughbred venue. |
| Addington | NZ | Harness / Greyhound | Source data may distinguish harness from greyhound meetings at the same venue. |
| Alexandra Park | NZ | Harness | Auckland harness venue. |
| Doomben | AUS | Thoroughbred | Explicit non-NZ comparison track; visible in Race Days filters and included in Betcha bet-back candidate scans when a current Doomben meeting is returned. |
| Wingatui | NZ | Thoroughbred | South Island thoroughbred venue. |
| Whanganui | NZ | Thoroughbred / Greyhound | Source data may use `Wanganui`, `Whanganui`, or `Hatrick` for greyhounds. |
| Cambridge | NZ | Harness / Greyhound | Source data may use `Cambridge`, `Cambridge Raceway`, or `Cambridge (G)`. |

## Filtering Rules

- Default historical MVP views should show country filters plus configured
  racecourse filters, including Tier 1 Australian comparison tracks.
- Doomben should be matched with Betcha `country = "AUS"` and included in Race
  Days filters and Betcha bet-back candidate scans as an explicit comparison
  track.
- Local Insight aggregates now expose all countries, selected country, all
  tracks, and selected track scopes so Australian comparison data can be
  inspected separately from NZ data.
- Track matching should use normalized aliases, not raw display names only.
- Race code should come from the source race type, not inferred from track name alone.

## Suggested Track Alias Seeds

| Canonical track | Aliases to watch |
| --- | --- |
| Ellerslie | `Ellerslie` |
| New Plymouth | `New Plymouth`, `New Plymouth Raceway`, `Pukekura Raceway` |
| Te Rapa | `Te Rapa` |
| Addington | `Addington`, `Addington Raceway` |
| Alexandra Park | `Alexandra Park`, `Auckland` |
| Doomben | `Doomben` |
| Wingatui | `Wingatui` |
| Whanganui | `Whanganui`, `Wanganui`, `Hatrick` |
| Cambridge | `Cambridge`, `Cambridge Raceway`, `Cambridge (G)` |

## Australian Expansion Candidates

Promotions can apply to Australian thoroughbred, greyhound, and harness races,
so AU coverage should move beyond Doomben. The preferred production direction is
to collect all AU domestic meetings for `HORSE`, `HARNESS`, and `GREYHOUND`.
The Tier 1 AU tracks below are configured in the local historical collector and
current promotion candidate scanner. They were selected from the most frequent
tracks in the current 183-day Betcha source scan.

Tier 1 thoroughbred:

- Ascot
- Sunshine Coast
- Ipswich
- Eagle Farm
- Pakenham
- Doomben
- Morphettville
- Newcastle
- Gold Coast
- Toowoomba
- Townsville
- Cranbourne

Tier 1 harness:

- Albion Park
- Redcliffe
- Globe Derby
- Gloucester Park
- Menangle
- Newcastle
- Melton
- Bathurst
- Pinjarra
- Penrith
- Shepparton
- Mildura

Tier 1 greyhound:

- Q1 Lakeside
- Mandurah
- Angle Park
- Richmond
- Healesville
- Warragul
- The Gardens
- Ballarat
- Geelong
- Shepparton
- Taree
- Q Straight
- Q2 Parklands
- Nowra
- Warrnambool

## Data Model Implication

Add a `tracks` table before production ingestion if source matching becomes messy:

- `id uuid primary key`
- `canonical_name text not null`
- `country text not null`
- `default_race_codes text[]`
- `include_in_mvp boolean default false`
- `include_as_comparison boolean default false`

Add a `track_aliases` table:

- `id uuid primary key`
- `track_id uuid references tracks(id)`
- `source text`
- `alias text not null`
- `race_code text`

This avoids hard-coding alias logic inside each parser.

## Open Questions

- Confirm whether `Alexandra Park` appears as `Auckland` in all TAB/Form Guide harness records.
- Confirm whether Whanganui greyhound meetings should canonicalize under `Whanganui` or keep `Hatrick` as a separate track.
- Decide whether production Supabase read models should include Australian
  comparison tracks in default Insight totals or expose them only through
  country/comparison filters.
