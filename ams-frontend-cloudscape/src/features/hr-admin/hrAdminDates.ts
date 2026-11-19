const dubaiCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const documentLabel = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "short",
  day: "2-digit",
});
const localTimestamp = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "shortOffset",
});

function timestamp(value: unknown): Date | null {
  const raw = typeof value === "object" && value && "Time" in value ? value.Time : value;
  if (typeof raw !== "string" || !raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

// Historic document timestamps can cross midnight when read in the UAE.
export function documentDateInput(value: unknown) {
  const date = timestamp(value);
  if (!date) return "";
  const parts = dubaiCalendar.formatToParts(date);
  const part = (name: "year" | "month" | "day") => parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatDocumentDate(value: unknown) {
  const date = timestamp(value);
  return date ? documentLabel.format(date) : "—";
}

export function formatEventTime(value: unknown) {
  const date = timestamp(value);
  return date ? localTimestamp.format(date) : "Not available";
}
