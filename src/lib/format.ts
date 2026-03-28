export function formatSlotTime(time: string): string {
  // "18:00" -> "18:00"
  return time;
}

export function formatSlotDate(date: string): string {
  // "2026-03-28" -> "Sat, Mar 28"
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
