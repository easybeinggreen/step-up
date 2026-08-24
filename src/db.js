import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const SYNC_CONFIGURED = url.startsWith('http') && !!anonKey;

export const supabase = SYNC_CONFIGURED ? createClient(url, anonKey) : null;

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  return supabase;
}

export async function getRoutines() {
  const { data, error } = await requireClient().from('routines').select('id, name, category').order('name');
  if (error) throw error;
  return data;
}

export async function getRoutineWithExercises(routineId) {
  const { data, error } = await requireClient()
    .from('routine_exercises')
    .select('id, order_index, target_sets, target_reps, target_weight_kg, target_duration_seconds, exercises ( id, name, category, description, is_timed, default_seconds_per_rep )')
    .eq('routine_id', routineId)
    .order('order_index');
  if (error) throw error;
  return data;
}

export async function startSession(planDayId = null, temperatureC = null) {
  const { data, error } = await requireClient()
    .from('workout_sessions')
    .insert({ plan_day_id: planDayId, temperature_c: temperatureC })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function logSet(sessionId, exerciseId, setIndex, { reps, durationSeconds, weightKg } = {}) {
  const { data, error } = await requireClient()
    .from('session_sets')
    .insert({
      session_id: sessionId,
      exercise_id: exerciseId,
      set_index: setIndex,
      reps: reps ?? null,
      duration_seconds: durationSeconds ?? null,
      weight_kg: weightKg ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoutineExerciseWeight(routineExerciseId, weightKg) {
  const { error } = await requireClient()
    .from('routine_exercises')
    .update({ target_weight_kg: weightKg })
    .eq('id', routineExerciseId);
  if (error) throw error;
}

export async function finishSession(sessionId, overallNote = null) {
  const { data, error } = await requireClient()
    .from('workout_sessions')
    .update({ finished_at: new Date().toISOString(), overall_note: overallNote })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setSessionTemperature(sessionId, temperatureC) {
  const { error } = await requireClient()
    .from('workout_sessions')
    .update({ temperature_c: temperatureC })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function getRecentSessions(limit = 20) {
  const { data, error } = await requireClient()
    .from('workout_sessions')
    .select('id, started_at, finished_at, temperature_c, overall_note')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getSessionSets(sessionId) {
  const { data, error } = await requireClient()
    .from('session_sets')
    .select('id, exercise_id, set_index, reps, duration_seconds, weight_kg, logged_at, exercises ( name )')
    .eq('session_id', sessionId)
    .order('logged_at');
  if (error) throw error;
  return data;
}

// Weekly review: sets logged in the last 7 days, joined with exercise name.
export async function getWeekSets() {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { data, error } = await requireClient()
    .from('session_sets')
    .select('exercise_id, reps, weight_kg, duration_seconds, logged_at, exercises ( name, category )')
    .gte('logged_at', since.toISOString());
  if (error) throw error;
  return data;
}

export async function countExerciseHistory(exerciseId) {
  const { count, error } = await requireClient()
    .from('session_sets')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_id', exerciseId);
  if (error) throw error;
  return count ?? 0;
}

// --- Plan days & constraints (rule-based rotation, see src/plan.js) ---

export async function getPlanDay(date) {
  const { data, error } = await requireClient()
    .from('plan_days')
    .select('id, date, routine_id, status, note, routines ( id, name, category )')
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRecentPlanDays(beforeDate, limit = 14) {
  const { data, error } = await requireClient()
    .from('plan_days')
    .select('id, date, routine_id, status, routines ( category )')
    .lt('date', beforeDate)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createPlanDay(date, routineId, status = 'planned', note = null) {
  const { data, error } = await requireClient()
    .from('plan_days')
    .insert({ date, routine_id: routineId, status, note })
    .select('id, date, routine_id, status, note, routines ( id, name, category )')
    .single();
  if (error) throw error;
  return data;
}

export async function updatePlanDay(planDayId, fields) {
  const { data, error } = await requireClient()
    .from('plan_days')
    .update(fields)
    .eq('id', planDayId)
    .select('id, date, routine_id, status, note, routines ( id, name, category )')
    .single();
  if (error) throw error;
  return data;
}

export async function getActiveConstraints(date) {
  const { data, error } = await requireClient()
    .from('constraints')
    .select('id, starts_on, ends_on, category, note')
    .lte('starts_on', date)
    .or(`ends_on.is.null,ends_on.gte.${date}`);
  if (error) throw error;
  return data;
}

// --- Body metrics (manual entry — Paul's scale isn't Bluetooth) ---

export async function addBodyMetric({ date, weightKg = null, measurements = null }) {
  const { data, error } = await requireClient()
    .from('body_metrics')
    .insert({ date, weight_kg: weightKg, measurements })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getBodyMetrics(limit = 20) {
  const { data, error } = await requireClient()
    .from('body_metrics')
    .select('id, date, weight_kg, measurements')
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function savePushSubscription(subscriptionJson) {
  const { error } = await requireClient()
    .from('push_subscriptions')
    .upsert({ subscription: subscriptionJson, endpoint: subscriptionJson.endpoint }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function addConstraint({ startsOn, endsOn = null, category = null, note = null }) {
  const { data, error } = await requireClient()
    .from('constraints')
    .insert({ starts_on: startsOn, ends_on: endsOn, category, note })
    .select()
    .single();
  if (error) throw error;
  return data;
}
