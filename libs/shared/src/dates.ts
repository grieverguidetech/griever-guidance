/**
 * `SessionDetails.dateOfPassing`/`serviceDate` are stored as whatever the
 * family typed ("May 29, 2026") or an ISO date, per `apps/web`'s
 * `DateField.tsx` convention — this parses either into a real `Date` for
 * math (e.g. contact retention), without pulling in a date library.
 */
export function parseLooseDate(value: string | undefined | null): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
