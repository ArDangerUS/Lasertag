// Single source of truth for the initial catalog (locations, activities,
// prices, addons, packages). Consumed by prisma/seed.ts. Everything here is
// editable later in the CRM — these are just sensible starting values taken
// from lasertag.in.ua and the client's booking mock-up.

export type SeedPrice = {
  locationSlug?: string | null; // null => base price for all locations
  durationMin?: number | null; // for lasertag: 30 / 60
  weekday: number;
  weekend: number; // holidays use weekend pricing too
};

export type SeedActivity = {
  key: string;
  category: "game" | "show" | "room" | "package";
  nameUk: string;
  nameRu: string;
  nameEn: string;
  descUk: string;
  descRu: string;
  descEn: string;
  icon: string;
  photo?: string;
  perPerson: boolean;
  durationMin: number;
  durationOptions?: number[]; // lasertag => [30,60]
  cleanupMin?: number;
  minPeople: number;
  maxPeople: number;
  sortOrder: number;
  // Locations where this activity is offered (slugs). "*" = all non-mobile.
  locations: string[];
  prices: SeedPrice[];
};

export const LOCATIONS = [
  {
    slug: "nyvky",
    name: "Нивки G-75",
    address: "м. Київ, пр-т Перемоги, 84Б",
    openMin: 10 * 60,
    closeMin: 20 * 60, // 10:00–20:00 (можна до 21:00 за попереднім бронюванням)
    isMobile: false,
    banquetRooms: 2,
    hasShowRoom: false,
    sortOrder: 1,
  },
  {
    slug: "gorodok",
    name: "ТРЦ Gorodok",
    address: "м. Київ, пр-т Степана Бандери, 23",
    openMin: 10 * 60,
    closeMin: 21 * 60, // 10:00–21:00
    isMobile: false,
    banquetRooms: 7, // сім тематичних кімнат
    hasShowRoom: true, // спеціальна кімната для шоу-програм
    sortOrder: 2,
  },
  {
    slug: "new-way",
    name: "ТРЦ New Way",
    address: "м. Київ, вул. Архітектора Вербицького, 1",
    openMin: 10 * 60,
    closeMin: 20 * 60,
    isMobile: false,
    banquetRooms: 3,
    hasShowRoom: false,
    sortOrder: 3,
  },
  {
    slug: "dream-yellow",
    name: "ТРЦ DREAM Yellow",
    address: "м. Київ, Оболонський пр-т, 1Б",
    openMin: 10 * 60,
    closeMin: 21 * 60,
    isMobile: false,
    banquetRooms: 1,
    hasShowRoom: false,
    sortOrder: 4,
  },
  {
    slug: "mobile",
    name: "Виїзний формат",
    address: "Ваша адреса у межах Києва та області",
    openMin: 9 * 60,
    closeMin: 22 * 60,
    isMobile: true,
    banquetRooms: 0,
    hasShowRoom: false,
    sortOrder: 5,
  },
];

const ALL = ["nyvky", "gorodok", "new-way", "dream-yellow"];

export const ACTIVITIES: SeedActivity[] = [
  {
    key: "laser",
    category: "game",
    nameUk: "Лазертаг",
    nameRu: "Лазертаг",
    nameEn: "Lasertag",
    descUk: "командна гра на арені",
    descRu: "командная игра на арене",
    descEn: "team battle on the arena",
    icon: "🎯",
    perPerson: true,
    durationMin: 60,
    durationOptions: [30, 60],
    cleanupMin: 0,
    minPeople: 4,
    maxPeople: 30,
    sortOrder: 1,
    locations: ALL,
    prices: [
      { durationMin: 30, weekday: 500, weekend: 600 },
      { durationMin: 60, weekday: 800, weekend: 900 },
      // Gorodok — трохи інші ціни
      { locationSlug: "gorodok", durationMin: 30, weekday: 550, weekend: 650 },
      { locationSlug: "gorodok", durationMin: 60, weekday: 850, weekend: 950 },
    ],
  },
  {
    key: "scenario",
    category: "game",
    nameUk: "Сценарний лазертаг «Точка захоплення»",
    nameRu: "Сценарный лазертаг «Точка захвата»",
    nameEn: "Scenario lasertag “Capture Point”",
    descUk: "лазертаг із сюжетом та місіями",
    descRu: "лазертаг с сюжетом и миссиями",
    descEn: "story-driven lasertag with missions",
    icon: "🚩",
    perPerson: true,
    durationMin: 60,
    cleanupMin: 0,
    minPeople: 6,
    maxPeople: 20,
    sortOrder: 2,
    locations: ALL,
    prices: [{ weekday: 1000, weekend: 1100 }],
  },
  {
    key: "quest",
    category: "game",
    nameUk: "Квест",
    nameRu: "Квест",
    nameEn: "Quest",
    descUk: "до 10 осіб · командна розумова гра",
    descRu: "до 10 человек · командная логическая игра",
    descEn: "up to 10 people · team puzzle game",
    icon: "🔍",
    perPerson: false,
    durationMin: 60,
    cleanupMin: 15, // 15–20 хв на перегрузку; у завантажені дні можна без зазору
    minPeople: 2,
    maxPeople: 10,
    sortOrder: 3,
    locations: ALL,
    prices: [
      { weekday: 5000, weekend: 5000 },
      { locationSlug: "gorodok", weekday: 5500, weekend: 5500 },
    ],
  },
  {
    key: "papershow",
    category: "show",
    nameUk: "Паперове шоу",
    nameRu: "Бумажное шоу",
    nameEn: "Paper show",
    descUk: "до 10 осіб · яскраве шоу з паперу",
    descRu: "до 10 человек · яркое бумажное шоу",
    descEn: "up to 10 people · vibrant paper show",
    icon: "🎉",
    perPerson: false,
    durationMin: 30,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 20,
    sortOrder: 4,
    locations: ALL,
    prices: [{ weekday: 5000, weekend: 5000 }],
  },
  {
    key: "maze",
    category: "game",
    nameUk: "Лабіринт «Хранитель Тіней»",
    nameRu: "Лабиринт «Хранитель Теней»",
    nameEn: "Maze “Shadow Keeper”",
    descUk: "до 10 осіб · темний лабіринт",
    descRu: "до 10 человек · тёмный лабиринт",
    descEn: "up to 10 people · dark maze",
    icon: "🌀",
    perPerson: false,
    durationMin: 60,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 10,
    sortOrder: 5,
    locations: ["gorodok"],
    prices: [{ weekday: 6000, weekend: 6000 }],
  },
  {
    key: "neotrek",
    category: "game",
    nameUk: "Неотрек",
    nameRu: "Неотрек",
    nameEn: "Neotrek",
    descUk: "інтерактивна активна розвага",
    descRu: "интерактивное активное развлечение",
    descEn: "interactive active attraction",
    icon: "💚",
    perPerson: true,
    durationMin: 30,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 15,
    sortOrder: 6,
    locations: ["gorodok", "dream-yellow"],
    prices: [{ weekday: 400, weekend: 450 }],
  },
  {
    key: "squid",
    category: "game",
    nameUk: "Гра в кальмара",
    nameRu: "Игра в кальмара",
    nameEn: "Squid Game",
    descUk: "командні ігри-випробування",
    descRu: "командные игры-испытания",
    descEn: "team challenge games",
    icon: "🦑",
    perPerson: true,
    durationMin: 60,
    cleanupMin: 0,
    minPeople: 6,
    maxPeople: 20,
    sortOrder: 7,
    locations: ["gorodok"],
    prices: [{ weekday: 600, weekend: 700 }],
  },
  {
    key: "banquet",
    category: "room",
    nameUk: "Бенкетна кімната",
    nameRu: "Банкетная комната",
    nameEn: "Banquet room",
    descUk: "своя кімната для святкування",
    descRu: "своя комната для празднования",
    descEn: "your own celebration room",
    icon: "🍰",
    perPerson: false,
    durationMin: 60,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 30,
    sortOrder: 8,
    locations: ALL,
    prices: [{ weekday: 1000, weekend: 1000 }],
  },
  {
    key: "mobile-laser",
    category: "game",
    nameUk: "Виїзний лазертаг",
    nameRu: "Выездной лазертаг",
    nameEn: "Mobile lasertag",
    descUk: "до 10 осіб включно (+10% за дод. учасника) + дорога",
    descRu: "до 10 человек (+10% за доп. участника) + дорога",
    descEn: "up to 10 people (+10% per extra) + travel",
    icon: "🚐",
    perPerson: false,
    durationMin: 60,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 10,
    sortOrder: 9,
    locations: ["mobile"],
    prices: [{ weekday: 12000, weekend: 12000 }],
  },
];

export const ADDONS = [
  { key: "pinata", nameUk: "Піньята-сюрприз", nameRu: "Пиньята-сюрприз", nameEn: "Piñata surprise", subUk: "1 кг цукерок, тематика з локації", subRu: "1 кг конфет, тематика локации", subEn: "1 kg of sweets, themed", price: 1200, sortOrder: 1 },
  { key: "pinata-custom", nameUk: "Піньята під замовлення", nameRu: "Пиньята под заказ", nameEn: "Custom piñata", subUk: "індивідуальна тематика", subRu: "индивидуальная тематика", subEn: "custom theme", price: 1400, sortOrder: 2 },
  { key: "pinata-own", nameUk: "Своя піньята (наповнення від нас)", nameRu: "Своя пиньята", nameEn: "Bring-your-own piñata", subUk: "без конфеті, чупа-чупсів та скляних іграшок", subRu: "без конфетти и стеклянных игрушек", subEn: "no confetti / glass toys", price: 500, sortOrder: 3 },
  { key: "animator", nameUk: "Аніматор", nameRu: "Аниматор", nameEn: "Animator", subUk: "2 години · 1 аніматор", subRu: "2 часа · 1 аниматор", subEn: "2 hours · 1 animator", price: 3000, sortOrder: 4 },
  { key: "photographer", nameUk: "Фотограф", nameRu: "Фотограф", nameEn: "Photographer", subUk: "1 година зйомки", subRu: "1 час съёмки", subEn: "1 hour session", price: 2000, sortOrder: 5 },
  { key: "cake", nameUk: "Святковий торт", nameRu: "Праздничный торт", nameEn: "Cake", subUk: "на замовлення", subRu: "на заказ", subEn: "made to order", price: 1500, sortOrder: 6 },
  { key: "glitter", nameUk: "Глітер-тату / аквагрим", nameRu: "Глиттер-тату / аквагрим", nameEn: "Glitter tattoo / face paint", subUk: "для всіх учасників", subRu: "для всех участников", subEn: "for all guests", price: 800, sortOrder: 7 },
  { key: "arena", nameUk: "Індивідуальне закриття арени", nameRu: "Индивидуальное закрытие арены", nameEn: "Private arena", subUk: "лазертаг тільки для вас, 1 год", subRu: "лазертаг только для вас, 1 час", subEn: "lasertag just for you, 1h", price: 14000, sortOrder: 8 },
];

// Complex offers. Booked in the client's recommended sequence:
// quest → lasertag → paper show → banquet.
export const PACKAGES = [
  {
    key: "stalker",
    nameUk: "Комплекс «Сталкер»",
    nameRu: "Комплекс «Сталкер»",
    nameEn: "“Stalker” package",
    descUk: "Квест + Лазертаг + Бенкетна кімната — у правильній послідовності свята",
    descRu: "Квест + Лазертаг + Банкетная комната",
    descEn: "Quest + Lasertag + Banquet room, in the ideal party order",
    icon: "🎁",
    fixedPriceWeekday: 0, // 0 => сума позицій
    fixedPriceWeekend: 0,
    sortOrder: 1,
    items: ["quest", "laser", "banquet"],
  },
  {
    key: "mega",
    nameUk: "Комплекс «Мега свято»",
    nameRu: "Комплекс «Мега праздник»",
    nameEn: "“Mega party” package",
    descUk: "Квест + Лазертаг + Паперове шоу + Бенкетна кімната",
    descRu: "Квест + Лазертаг + Бумажное шоу + Банкетная комната",
    descEn: "Quest + Lasertag + Paper show + Banquet room",
    icon: "🎪",
    fixedPriceWeekday: 0,
    fixedPriceWeekend: 0,
    sortOrder: 2,
    items: ["quest", "laser", "papershow", "banquet"],
  },
];

// Ukrainian public holidays that use weekend (higher) pricing. Month-day.
export const HOLIDAY_MMDD = [
  "01-01", // Новий рік
  "01-07", // Різдво (Юліанський)
  "12-25", // Різдво
  "03-08", // 8 березня
  "05-01", // День праці
  "05-09", // День перемоги/памʼяті
  "06-28", // День Конституції
  "08-24", // День Незалежності
  "10-01", // День захисників
];
