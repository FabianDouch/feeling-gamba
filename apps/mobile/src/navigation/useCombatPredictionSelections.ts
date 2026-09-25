import { useState } from "react";
import { PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY, UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY, type WinPercentageMultiModelKey } from "../data/supabasePredictions";
import type { PredictionFormat } from "../screens/PredictionControls";

type CombatSelection = { format: PredictionFormat; model: WinPercentageMultiModelKey };
export type CombatSelectionControl = {
  selection: CombatSelection;
  update: (change: (current: CombatSelection) => CombatSelection) => void;
};

// Remember each combat league's model independently when opening or returning from its combined section.
export function useCombatPredictionSelections() {
  const [selections, setSelections] = useState<Record<"ufc" | "pfl", CombatSelection>>({
    ufc: { format: "multis", model: UFC_FAVOURITE_PRICE_MULTI_MODEL_KEY },
    pfl: { format: "multis", model: PFL_FAVOURITE_PRICE_MULTI_MODEL_KEY },
  });
  // Apply format/model updates to the latest state so batched changes cannot overwrite each other.
  function control(league: "ufc" | "pfl"): CombatSelectionControl {
    return { selection: selections[league], update: (change) => setSelections((current) => ({ ...current, [league]: change(current[league]) })) };
  }
  return control;
}
