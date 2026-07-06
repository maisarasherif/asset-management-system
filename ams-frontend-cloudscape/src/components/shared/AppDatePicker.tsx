import { Button } from "@cloudscape-design/components";
import { useEffect, useRef, useState } from "react";

type AppDatePickerProps = {
  ariaLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (message: string) => void;
};

export function formatDmyDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

export function parseDmyDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return isoDate;
}

export function AppDatePicker({
  ariaLabel,
  disabled = false,
  invalid = false,
  placeholder = "DD/MM/YYYY",
  value,
  onChange,
  onValidityChange,
}: AppDatePickerProps) {
  const nativePickerRef = useRef<HTMLInputElement | null>(null);
  const [displayValue, setDisplayValue] = useState(formatDmyDate(value));

  useEffect(() => {
    setDisplayValue(formatDmyDate(value));
    onValidityChange?.("");
  }, [onValidityChange, value]);

  const setValidationMessage = (message: string) => {
    onValidityChange?.(message);
  };

  const openNativePicker = () => {
    const picker = nativePickerRef.current;
    if (!picker) {
      return;
    }
    if (typeof picker.showPicker === "function") {
      picker.showPicker();
      return;
    }
    picker.click();
  };

  return (
    <div className="app-date-picker">
      <input
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        className="app-native-input"
        disabled={disabled}
        inputMode="numeric"
        placeholder={placeholder}
        value={displayValue}
        onChange={(event) => {
          const nextDisplayValue = event.target.value;
          setDisplayValue(nextDisplayValue);
          if (!nextDisplayValue.trim()) {
            setValidationMessage("");
            onChange("");
            return;
          }
          const nextValue = parseDmyDate(nextDisplayValue);
          if (!nextValue) {
            setValidationMessage("Use DD/MM/YYYY.");
            return;
          }
          setValidationMessage("");
          onChange(nextValue);
        }}
      />
      <Button
        ariaLabel={`Open ${ariaLabel.toLowerCase()} picker`}
        disabled={disabled}
        formAction="none"
        iconName="calendar"
        onClick={openNativePicker}
      />
      <input
        ref={nativePickerRef}
        aria-hidden="true"
        className="app-date-picker__native"
        disabled={disabled}
        tabIndex={-1}
        type="date"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDisplayValue(formatDmyDate(nextValue));
          setValidationMessage("");
          onChange(nextValue);
        }}
      />
    </div>
  );
}
