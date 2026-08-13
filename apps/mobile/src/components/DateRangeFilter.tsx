import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type DateOption = {
  label: string;
  value: string;
};

type DateBoundary = "fromDate" | "toDate";
type DateParts = {
  day: number;
  month: number;
  year: number;
};

type DateRangeFilterProps = {
  availableLabel?: string;
  fromDate: string;
  onChange: (key: DateBoundary, value: string) => void;
  onReset: () => void;
  options: DateOption[];
  toDate: string;
  windowLabel: string;
};

/**
 * Provides date-range shortcuts, direct date jumps, and adjacent-date stepping.
 */
export function DateRangeFilter({
  availableLabel = "available dates",
  fromDate,
  onChange,
  onReset,
  options,
  toDate,
  windowLabel,
}: DateRangeFilterProps) {
  const [activeBoundary, setActiveBoundary] = useState<DateBoundary | null>(null);
  const [pendingDate, setPendingDate] = useState("");
  const sortedOptions = useMemo(() =>
    [...options].sort((left, right) => left.value.localeCompare(right.value)), [options]);
  const optionValues = useMemo(() =>
    new Set(sortedOptions.map((option) => option.value)), [sortedOptions]);
  const hasOptions = sortedOptions.length > 0;
  const today = getSourceDate(0);
  const yesterday = getSourceDate(-1);
  const latestDate = sortedOptions.at(-1)?.value ?? "";
  const earliestDate = sortedOptions[0]?.value ?? "";
  const lastSevenStart = sortedOptions.slice(-7)[0]?.value ?? "";

  useEffect(() => {
    if (!activeBoundary) {
      return;
    }

    setPendingDate(activeBoundary === "fromDate" ? fromDate : toDate);
  }, [activeBoundary, fromDate, toDate]);

  function hasDate(value: string) {
    return Boolean(value && (!hasOptions || optionValues.has(value)));
  }

  function applyRange(from: string, to: string) {
    onChange("fromDate", from);
    onChange("toDate", to);
    setActiveBoundary(null);
  }

  function applyPreset(from: string, to: string) {
    if (!from || !to || !hasDate(from) || !hasDate(to)) {
      return;
    }

    applyRange(from, to);
  }

  return (
    <View style={styles.dateRangeGroup}>
      <View style={styles.dateRangeHeader}>
        <View style={styles.dateRangeHeading}>
          <Text style={styles.filterLabel}>Date range</Text>
          <Text style={styles.dateRangeNote}>{windowLabel}</Text>
        </View>
        <Pressable onPress={() => {
          setActiveBoundary(null);
          onReset();
        }} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
      </View>

      <View style={styles.quickRangeRow}>
        <QuickRangeButton
          disabled={!hasDate(today)}
          label="Today"
          onPress={() => applyPreset(today, today)}
        />
        <QuickRangeButton
          disabled={!hasDate(yesterday)}
          label="Yesterday"
          onPress={() => applyPreset(yesterday, yesterday)}
        />
        <QuickRangeButton
          disabled={!hasDate(lastSevenStart) || !hasDate(latestDate)}
          label="Last 7"
          onPress={() => applyPreset(lastSevenStart, latestDate)}
        />
        <QuickRangeButton
          disabled={!hasDate(earliestDate) || !hasDate(latestDate)}
          label="All"
          onPress={() => applyPreset(earliestDate, latestDate)}
        />
      </View>

      <View style={styles.dateRangeRow}>
        <DateStepper
          active={activeBoundary === "fromDate"}
          availableLabel={availableLabel}
          label="From"
          onChange={(value) => onChange("fromDate", value)}
          onClose={() => setActiveBoundary(null)}
          onOpen={() => setActiveBoundary(activeBoundary === "fromDate" ? null : "fromDate")}
          optionValues={optionValues}
          options={sortedOptions}
          pendingDate={pendingDate}
          setPendingDate={setPendingDate}
          value={fromDate}
        />
        <DateStepper
          active={activeBoundary === "toDate"}
          availableLabel={availableLabel}
          label="To"
          onChange={(value) => onChange("toDate", value)}
          onClose={() => setActiveBoundary(null)}
          onOpen={() => setActiveBoundary(activeBoundary === "toDate" ? null : "toDate")}
          optionValues={optionValues}
          options={sortedOptions}
          pendingDate={pendingDate}
          setPendingDate={setPendingDate}
          value={toDate}
        />
      </View>
    </View>
  );
}

type QuickRangeButtonProps = {
  disabled: boolean;
  label: string;
  onPress: () => void;
};

function QuickRangeButton({ disabled, label, onPress }: QuickRangeButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.quickRangeButton, disabled ? styles.quickRangeButtonDisabled : null]}
    >
      <Text style={[styles.quickRangeText, disabled ? styles.quickRangeTextDisabled : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

type DateStepperProps = {
  active: boolean;
  availableLabel: string;
  label: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onOpen: () => void;
  options: DateOption[];
  optionValues: Set<string>;
  pendingDate: string;
  setPendingDate: (value: string) => void;
  value: string;
};

function DateStepper({
  active,
  availableLabel,
  label,
  onChange,
  onClose,
  onOpen,
  options,
  optionValues,
  pendingDate,
  setPendingDate,
  value,
}: DateStepperProps) {
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const canMovePrevious = selectedIndex > 0;
  const canMoveNext = selectedIndex >= 0 && selectedIndex < options.length - 1;
  const selectedParts = parseDateParts(pendingDate)
    ?? parseDateParts(value)
    ?? parseDateParts(options.at(-1)?.value ?? "");
  const pickerColumns = selectedParts
    ? buildPickerColumns(options, selectedParts)
    : { days: [], months: [], years: [] };
  const pendingLabel = isValidDate(pendingDate)
    ? formatFallbackDateLabel(pendingDate)
    : "No date selected";
  const pendingIsValid = isValidDate(pendingDate) && (!options.length || optionValues.has(pendingDate));

  function move(direction: -1 | 1) {
    if (selectedIndex < 0) {
      return;
    }

    const nextOption = options[selectedIndex + direction];

    if (nextOption) {
      onChange(nextOption.value);
    }
  }

  function applyDate(value: string) {
    if (!isValidDate(value) || (options.length && !optionValues.has(value))) {
      return;
    }

    onChange(value);
    onClose();
  }

  function updatePickerPart(part: keyof DateParts, nextValue: number) {
    if (!selectedParts) {
      return;
    }

    const nextDate = findNearestAvailableDate(options, {
      ...selectedParts,
      [part]: nextValue,
    }, part);

    if (nextDate) {
      setPendingDate(nextDate);
    }
  }

  return (
    <View style={styles.dateStepper}>
      <Text style={styles.dateStepperLabel}>{label}</Text>
      <View style={styles.dateStepperControls}>
        <Pressable
          disabled={!canMovePrevious || options.length === 0}
          onPress={() => move(-1)}
          style={[
            styles.dateStepButton,
            !canMovePrevious ? styles.dateStepButtonDisabled : null,
          ]}
        >
          <Text
            style={[
              styles.dateStepButtonText,
              !canMovePrevious ? styles.dateStepButtonTextDisabled : null,
            ]}
          >
            {"<"}
          </Text>
        </Pressable>
        <Pressable onPress={onOpen} style={styles.dateStepperValueButton}>
          <Text style={styles.dateStepperValue}>
            {selectedOption?.label ?? formatFallbackDateLabel(value)}
          </Text>
        </Pressable>
        <Pressable
          disabled={!canMoveNext || options.length === 0}
          onPress={() => move(1)}
          style={[
            styles.dateStepButton,
            !canMoveNext ? styles.dateStepButtonDisabled : null,
          ]}
        >
          <Text
            style={[
              styles.dateStepButtonText,
              !canMoveNext ? styles.dateStepButtonTextDisabled : null,
            ]}
          >
            {">"}
          </Text>
        </Pressable>
      </View>

      {active ? (
        <View style={styles.dateJumpPanel}>
          <Text style={styles.dateJumpTitle}>Jump to {label.toLowerCase()} date</Text>
          <View style={styles.pickerHeaderRow}>
            <View>
              <Text style={styles.pickerHeaderLabel}>Selected</Text>
              <Text style={styles.pickerHeaderValue}>{pendingLabel}</Text>
            </View>
            <Pressable
              disabled={!pendingIsValid}
              onPress={() => applyDate(pendingDate)}
              style={[styles.dateJumpApplyButton, !pendingIsValid ? styles.dateJumpApplyButtonDisabled : null]}
            >
              <Text style={[styles.dateJumpApplyText, !pendingIsValid ? styles.dateJumpApplyTextDisabled : null]}>
                Apply
              </Text>
            </Pressable>
          </View>
          <Text style={styles.dateJumpHint}>
            {options.length
              ? `Scroll day, month, and year to choose one of the ${availableLabel}.`
              : "No dates are available yet."}
          </Text>
          {options.length && selectedParts ? (
            <View style={styles.wheelPicker}>
              <PickerColumn
                activeValue={selectedParts.day}
                label="Day"
                onChange={(nextValue) => updatePickerPart("day", nextValue)}
                options={pickerColumns.days}
              />
              <PickerColumn
                activeValue={selectedParts.month}
                label="Month"
                onChange={(nextValue) => updatePickerPart("month", nextValue)}
                options={pickerColumns.months}
              />
              <PickerColumn
                activeValue={selectedParts.year}
                label="Year"
                onChange={(nextValue) => updatePickerPart("year", nextValue)}
                options={pickerColumns.years}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type PickerColumnOption = {
  label: string;
  value: number;
};

type PickerColumnProps = {
  activeValue: number;
  label: string;
  onChange: (value: number) => void;
  options: PickerColumnOption[];
};

function PickerColumn({ activeValue, label, onChange, options }: PickerColumnProps) {
  return (
    <View style={styles.pickerColumn}>
      <Text style={styles.pickerColumnLabel}>{label}</Text>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={styles.pickerColumnScroll}
      >
        {options.map((option) => {
          const isActive = option.value === activeValue;

          return (
            <Pressable
              key={`${label}-${option.value}`}
              onPress={() => onChange(option.value)}
              style={[styles.pickerColumnOption, isActive ? styles.pickerColumnOptionActive : null]}
            >
              <Text
                style={[styles.pickerColumnOptionText, isActive ? styles.pickerColumnOptionTextActive : null]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parseDateParts(value: string): DateParts | null {
  if (!isValidDate(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  return { day, month, year };
}

function formatDateParts(parts: DateParts) {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function buildPickerColumns(options: DateOption[], selectedParts: DateParts) {
  const dates = options
    .map((option) => parseDateParts(option.value))
    .filter((parts): parts is DateParts => Boolean(parts));
  const years = uniqueNumbers(dates.map((parts) => parts.year)).sort((left, right) => right - left);
  const months = uniqueNumbers(dates
    .filter((parts) => parts.year === selectedParts.year)
    .map((parts) => parts.month))
    .sort((left, right) => left - right);
  const days = uniqueNumbers(dates
    .filter((parts) => parts.year === selectedParts.year && parts.month === selectedParts.month)
    .map((parts) => parts.day))
    .sort((left, right) => left - right);

  return {
    days: days.map((day) => ({
      label: String(day).padStart(2, "0"),
      value: day,
    })),
    months: months.map((month) => ({
      label: new Intl.DateTimeFormat("en-NZ", { month: "short" })
        .format(new Date(Date.UTC(2026, month - 1, 1))),
      value: month,
    })),
    years: years.map((year) => ({
      label: String(year),
      value: year,
    })),
  };
}

function findNearestAvailableDate(options: DateOption[], targetParts: DateParts, changedPart: keyof DateParts) {
  const targetDate = formatDateParts(targetParts);

  if (options.some((option) => option.value === targetDate)) {
    return targetDate;
  }

  const candidates = options
    .map((option) => ({
      parts: parseDateParts(option.value),
      value: option.value,
    }))
    .filter((option): option is { parts: DateParts; value: string } => Boolean(option.parts))
    .filter((option) => {
      if (changedPart === "year") {
        return option.parts.year === targetParts.year;
      }

      if (changedPart === "month") {
        return option.parts.year === targetParts.year && option.parts.month === targetParts.month;
      }

      return option.parts.year === targetParts.year
        && option.parts.month === targetParts.month
        && option.parts.day === targetParts.day;
    });

  return candidates.sort((left, right) =>
    Math.abs(Date.parse(`${left.value}T00:00:00.000Z`) - Date.parse(`${targetDate}T00:00:00.000Z`))
    - Math.abs(Date.parse(`${right.value}T00:00:00.000Z`) - Date.parse(`${targetDate}T00:00:00.000Z`)))[0]?.value
    ?? null;
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)];
}

function formatFallbackDateLabel(value: string) {
  if (!value) {
    return "No dates";
  }

  if (!isValidDate(value)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

/**
 * Calculates date shortcuts using the app's Pacific/Auckland source-date day.
 */
function getSourceDate(offsetDays: number) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Pacific/Auckland",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  }

  const sourceTodayUtc = Date.UTC(Number(year), Number(month) - 1, Number(day));

  return new Date(sourceTodayUtc + offsetDays * 86400000).toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  dateJumpApplyButton: {
    alignItems: "center",
    backgroundColor: "#18202f",
    borderColor: "#18202f",
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  dateJumpApplyButtonDisabled: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
  },
  dateJumpApplyText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  dateJumpApplyTextDisabled: {
    color: "#98a2b3",
  },
  dateJumpHint: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  dateJumpPanel: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
  },
  dateJumpTitle: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
  },
  pickerColumn: {
    flex: 1,
    minWidth: 86,
  },
  pickerColumnLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
    textAlign: "center",
    textTransform: "uppercase",
  },
  pickerColumnOption: {
    alignItems: "center",
    borderRadius: 6,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  pickerColumnOptionActive: {
    backgroundColor: "#18202f",
  },
  pickerColumnOptionText: {
    color: "#475467",
    fontSize: 14,
    fontWeight: "800",
  },
  pickerColumnOptionTextActive: {
    color: "#ffffff",
  },
  pickerColumnScroll: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 190,
    padding: 4,
  },
  pickerHeaderLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  pickerHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  pickerHeaderValue: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  wheelPicker: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  dateRangeGroup: {
    marginBottom: 12,
    marginTop: 12,
  },
  dateRangeHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dateRangeHeading: {
    flex: 1,
  },
  dateRangeNote: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  dateRangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dateStepButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  dateStepButtonDisabled: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
  },
  dateStepButtonText: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
  },
  dateStepButtonTextDisabled: {
    color: "#98a2b3",
  },
  dateStepper: {
    flex: 1,
    minWidth: 210,
  },
  dateStepperControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  dateStepperLabel: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  dateStepperValue: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  dateStepperValueButton: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    minWidth: 104,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterLabel: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  quickRangeButton: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quickRangeButtonDisabled: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
  },
  quickRangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  quickRangeText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },
  quickRangeTextDisabled: {
    color: "#98a2b3",
  },
  resetButton: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resetButtonText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },
});
