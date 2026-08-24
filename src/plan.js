// Rule-based plan generator — no ML. Alternates routine categories day to
// day (e.g. Upper Body / Lower Body) and avoids categories an active
// constraint rules out (injury, unavailable day). See PROJECT_NOTES.md.

import { getPlanDay, getRecentPlanDays, createPlanDay, getActiveConstraints } from './db.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Picks a routine whose category differs from the most recent completed/planned day, honoring constraints. */
export function suggestRoutine(routines, recentPlanDays, activeConstraints) {
  const blockedCategories = new Set(activeConstraints.map((c) => c.category).filter(Boolean));
  const available = routines.filter((r) => !blockedCategories.has(r.category));
  if (available.length === 0) return null; // every category is currently constrained -> rest day

  const lastCategory = recentPlanDays.find((d) => d.routines?.category)?.routines?.category;
  if (!lastCategory) return available[0];

  const alternate = available.find((r) => r.category !== lastCategory);
  return alternate || available[0];
}

/**
 * Ensures today has a plan_days row, generating one from the rotation rule
 * if it doesn't exist yet. Returns the (possibly newly created) plan day,
 * or null if every category is currently constrained (a forced rest day).
 */
export async function ensureTodayPlan(routines) {
  const date = todayISO();
  const existing = await getPlanDay(date);
  if (existing) return existing;

  const [recent, constraints] = await Promise.all([getRecentPlanDays(date, 14), getActiveConstraints(date)]);
  const suggestion = suggestRoutine(routines, recent, constraints);

  if (!suggestion) {
    return createPlanDay(date, null, 'rest', 'All categories currently constrained');
  }
  return createPlanDay(date, suggestion.id, 'planned');
}
