// Shared enums-as-constants (SQLite has no native enums) and UI metadata.

export const BOOKING_STATUS = {
  NEW: "NEW",
  CONFIRMED: "CONFIRMED",
  PREPAID: "PREPAID",
  CANCELLED: "CANCELLED",
} as const;
export type BookingStatus = keyof typeof BOOKING_STATUS;
export const BOOKING_STATUSES = Object.keys(BOOKING_STATUS) as BookingStatus[];

export const STATUS_META: Record<
  BookingStatus,
  { uk: string; ru: string; en: string; color: string; dot: string }
> = {
  NEW: { uk: "Нова", ru: "Новая", en: "New", color: "#f5a623", dot: "#f5a623" },
  CONFIRMED: { uk: "Підтверджена", ru: "Подтверждена", en: "Confirmed", color: "#3cba54", dot: "#3cba54" },
  PREPAID: { uk: "Аванс", ru: "Аванс", en: "Prepaid", color: "#3b82f6", dot: "#3b82f6" },
  CANCELLED: { uk: "Скасована", ru: "Отменена", en: "Cancelled", color: "#9ca3af", dot: "#9ca3af" },
};

export const SOURCE = { SITE: "SITE", CRM: "CRM" } as const;

export const ROLE = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  VIEWER: "VIEWER",
} as const;
export type Role = keyof typeof ROLE;
export const ROLES = Object.keys(ROLE) as Role[];

export const ROLE_META: Record<Role, { uk: string; canWrite: boolean; canManageUsers: boolean; canEditCatalog: boolean }> = {
  ADMIN: { uk: "Адміністратор", canWrite: true, canManageUsers: true, canEditCatalog: true },
  MANAGER: { uk: "Менеджер", canWrite: true, canManageUsers: false, canEditCatalog: false },
  VIEWER: { uk: "Перегляд", canWrite: false, canManageUsers: false, canEditCatalog: false },
};

// Default prepaid amount required to confirm a booking (grn) — 1000 to FOP card.
export const DEFAULT_PREPAID = 1000;

// Time grid for the availability calendar.
export const SLOT_STEP_MIN = 30; // 30-minute grid
export const DURATIONS = [30, 60]; // lasertag durations offered in the calendar

export const LOCALES = ["uk", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "uk";

export function isRole(v: string): v is Role {
  return (ROLES as string[]).includes(v);
}
export function isStatus(v: string): v is BookingStatus {
  return (BOOKING_STATUSES as string[]).includes(v);
}
