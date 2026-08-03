// Pure date helpers for the CRM calendar (client-safe).

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function fromISO(iso: string): Date {
  return new Date(iso + "T12:00:00");
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Monday of the week containing `iso`.
export function mondayOf(iso: string): string {
  const d = fromISO(iso);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return toISO(d);
}

export function weekDays(mondayISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayISO, i));
}

const WD_UK = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "НД"];
const MONTHS_UK = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];
const WD_FULL_UK = [
  "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота", "неділя",
];

export function weekdayShort(iso: string): string {
  const d = fromISO(iso);
  return WD_UK[(d.getDay() + 6) % 7];
}

export function weekdayFull(iso: string): string {
  const d = fromISO(iso);
  return WD_FULL_UK[(d.getDay() + 6) % 7];
}

export function dayMonth(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function longDate(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS_UK[d.getMonth()]}`;
}

export function weekRangeLabel(mondayISO: string): string {
  const days = weekDays(mondayISO);
  const a = fromISO(days[0]);
  const b = fromISO(days[6]);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${MONTHS_UK[b.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTHS_UK[a.getMonth()]} – ${b.getDate()} ${MONTHS_UK[b.getMonth()]}`;
}

export const MONTHS_NOM_UK = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export function isWeekendISO(iso: string): boolean {
  const day = fromISO(iso).getDay();
  return day === 0 || day === 6;
}
