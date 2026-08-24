// Free, no-key weather lookup (Open-Meteo) so Brisbane's temperature is
// captured automatically at session start — no thermometer, no manual entry.

const BRISBANE = { latitude: -27.4698, longitude: 153.0251 };

export async function getCurrentTemperatureC() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${BRISBANE.latitude}&longitude=${BRISBANE.longitude}&current=temperature_2m&timezone=Australia%2FBrisbane`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.current?.temperature_2m ?? null;
  } catch {
    return null; // never block a workout on a weather lookup failing
  }
}
