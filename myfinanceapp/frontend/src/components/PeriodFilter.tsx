// Duration preset dropdown with a "Custom Range" option that reveals two date
// inputs. Pairs with the usePeriodFilter hook, which owns the state.
import {
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./shadcn";
import { CUSTOM_PERIOD } from "../hooks/usePeriodFilter";
import type { PeriodFilterState } from "../hooks/usePeriodFilter";

export interface PeriodOption {
  value: string;
  label: string;
}

interface PeriodFilterProps {
  period: PeriodFilterState;
  /** Duration presets; "Custom Range" is appended automatically */
  options: PeriodOption[];
  /** Width class for the preset dropdown */
  className?: string;
  /** Label shown when nothing is selected */
  placeholder?: string;
}

export default function PeriodFilter({
  period,
  options,
  className = "w-full sm:w-[150px]",
  placeholder,
}: PeriodFilterProps) {
  return (
    <>
      <Select value={period.preset} onValueChange={period.setPreset}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_PERIOD}>Custom Range</SelectItem>
        </SelectContent>
      </Select>

      {period.isCustom && (
        <>
          <Input
            type="date"
            aria-label="Start date"
            value={period.startInput}
            onChange={(e) => period.setStartInput(e.target.value)}
            className="w-full sm:w-[150px]"
          />
          <Input
            type="date"
            aria-label="End date"
            value={period.endInput}
            onChange={(e) => period.setEndInput(e.target.value)}
            className="w-full sm:w-[150px]"
          />
        </>
      )}
    </>
  );
}
