export type ListQuery = Readonly<Record<string, string | number | undefined>>;

export function listQueryString(query: ListQuery) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(name, String(value));
  }
  return params.toString();
}
