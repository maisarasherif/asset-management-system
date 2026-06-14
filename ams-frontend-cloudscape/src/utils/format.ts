import type {
  AssetStatus,
  CertificateStatus,
  SafetyCritical,
} from "../types/ams";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value?: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : dateFormatter.format(date);
}

export function formatDateTime(value: unknown): string {
  if (!value) return "Not available";

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not available" : dateTimeFormatter.format(date);
  }

  if (typeof value === "object" && value !== null) {
    const maybeTime = (value as { Time?: string }).Time;
    if (maybeTime) return formatDateTime(maybeTime);
  }

  return "Not available";
}

export function formatMonthDuration(value?: number | null): string {
  if (!value || value < 1) return "Not set";
  return `${value} ${value === 1 ? "month" : "months"}`;
}

export function formatRenewalDuration(requiresRenewal?: boolean, value?: number | null): string {
  if (requiresRenewal === false) return "No renewal";
  return formatMonthDuration(value);
}

export function humanizeEnum(
  value: AssetStatus | CertificateStatus | SafetyCritical | string
): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function toIsoDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}
