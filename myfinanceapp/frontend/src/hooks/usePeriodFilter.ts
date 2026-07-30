// Shared state for the Reports page time filters: a set of duration presets
// plus a "Custom Range" option backed by two date inputs.
import { useEffect, useState } from "react";
import { format, startOfMonth, subMonths } from "date-fns";

export const CUSTOM_PERIOD = "custom";

// A native <input type="date"> fires onChange for every intermediate valid
// date while the year is being typed (0002 -> 0020 -> 0202 -> 2026). Only a
// complete 4-digit-year date is worth sending to the API.
const isCompleteDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1000;

export interface PeriodFilterState {
  /** The selected preset, or CUSTOM_PERIOD */
  preset: string;
  setPreset: (preset: string) => void;
  isCustom: boolean;
  /** Draft values bound to the date inputs */
  startInput: string;
  endInput: string;
  setStartInput: (value: string) => void;
  setEndInput: (value: string) => void;
  /** Committed dates, set only while a custom range is selected */
  startDate?: string;
  endDate?: string;
}

/**
 * @param defaultPreset  preset selected on first render
 * @param defaultMonthsBack  how far back the custom range starts out
 */
export function usePeriodFilter(
  defaultPreset: string,
  defaultMonthsBack = 6,
): PeriodFilterState {
  const [preset, setPreset] = useState(defaultPreset);
  const [startInput, setStartInput] = useState(() =>
    format(
      startOfMonth(subMonths(new Date(), Math.max(defaultMonthsBack - 1, 0))),
      "yyyy-MM-dd",
    ),
  );
  const [endInput, setEndInput] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [startDate, setStartDate] = useState(startInput);
  const [endDate, setEndDate] = useState(endInput);

  // Commit a complete date only after the user stops typing, so reports don't
  // refetch against a half-typed year.
  useEffect(() => {
    if (!isCompleteDate(startInput)) return;
    const id = setTimeout(() => setStartDate(startInput), 500);
    return () => clearTimeout(id);
  }, [startInput]);

  useEffect(() => {
    if (!isCompleteDate(endInput)) return;
    const id = setTimeout(() => setEndDate(endInput), 500);
    return () => clearTimeout(id);
  }, [endInput]);

  const isCustom = preset === CUSTOM_PERIOD;

  return {
    preset,
    setPreset,
    isCustom,
    startInput,
    endInput,
    setStartInput,
    setEndInput,
    startDate: isCustom ? startDate : undefined,
    endDate: isCustom ? endDate : undefined,
  };
}
