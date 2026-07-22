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
    key: "puzzles",
    category: "game",
    nameUk: "Пазли",
    nameRu: "Пазлы",
    nameEn: "Puzzles",
    descUk: "інтерактивні пазли",
    descRu: "интерактивные пазлы",
    descEn: "interactive puzzles",
    icon: "🧩",
    perPerson: true,
    durationMin: 30,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 15,
    sortOrder: 7,
    locations: ["gorodok"],
    prices: [{ weekday: 300, weekend: 350 }],
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

// Complex offers ("комплекси"). Location-specific — content and prices differ.
// `items` is the bookable sequence placed on the calendar. Non-room items run
// consecutively in the client's recommended order (quest → lasertag → paper
// show → …); room items (banquet) are reserved in parallel for the whole event.
// `perksUk` is the full display bullet list (one perk per line), including
// non-bookable inclusions (host, gifts, piñata, cake take-out).
export type SeedPackageItem = { key: string; durationMin: number; order: number };
export type SeedPackage = {
  locationSlug: string;
  key: string;
  nameUk: string;
  nameRu: string;
  nameEn: string;
  perksUk: string;
  icon: string;
  maxPeople: number;
  weekday: number;
  weekend: number;
  sortOrder: number;
  items: SeedPackageItem[];
};

// canonical order weights for the booking sequence
const O = { quest: 10, scenario: 20, laser: 20, papershow: 30, maze: 40, squid: 50, puzzles: 60, neotrek: 70, banquet: 99 };

const STALKER_PERKS = "60 хвилин – Лазертаг «Сталкер»\nФірмові подарунки**\nВедучий програми\nДо 6 учасників";

export const PACKAGES: SeedPackage[] = [
  // ---------- Нивки ----------
  {
    locationSlug: "nyvky", key: "nyvky-stalker", icon: "🎯", maxPeople: 6,
    nameUk: "Комплекс «Сталкер»", nameRu: "Комплекс «Сталкер»", nameEn: "“Stalker” package",
    perksUk: STALKER_PERKS, weekday: 8700, weekend: 9000, sortOrder: 1,
    items: [{ key: "scenario", durationMin: 60, order: O.scenario }],
  },
  {
    locationSlug: "nyvky", key: "nyvky-gold", icon: "🥇", maxPeople: 10,
    nameUk: "Комплекс «Золотий стандарт»", nameRu: "Комплекс «Золотой стандарт»", nameEn: "“Gold standard” package",
    perksUk: "60 хвилин – Квест «Антивірус»\n60 хвилин – Лазертаг\n60 хвилин – Банкетна кімната\nВедучий програми\nДо 10 учасників",
    weekday: 12000, weekend: 14000, sortOrder: 2,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "laser", durationMin: 60, order: O.laser },
      { key: "banquet", durationMin: 60, order: O.banquet },
    ],
  },
  {
    locationSlug: "nyvky", key: "nyvky-vip", icon: "👑", maxPeople: 10,
    nameUk: "Комплекс «VIP PARTY»", nameRu: "Комплекс «VIP PARTY»", nameEn: "“VIP PARTY” package",
    perksUk: "60 хвилин – Лазертаг «Сталкер»\n60 хвилин – Квест на вибір\n30 хвилин – Паперове шоу\n3,5 години – Банкетна кімната\nПіньята***\nФірмові подарунки**\nВиніс торту\nВедучий програми\nДо 10 учасників",
    weekday: 28500, weekend: 30000, sortOrder: 3,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "scenario", durationMin: 60, order: O.scenario },
      { key: "papershow", durationMin: 30, order: O.papershow },
      { key: "banquet", durationMin: 210, order: O.banquet },
    ],
  },

  // ---------- ТРЦ Gorodok ----------
  {
    locationSlug: "gorodok", key: "gorodok-start", icon: "🚀", maxPeople: 10,
    nameUk: "Комплекс «Старт» (3 год)", nameRu: "Комплекс «Старт» (3 ч)", nameEn: "“Start” package (3h)",
    perksUk: "Ведучий програми\n60 хв – Квест\n60 хв – Лазертаг\nБанкетний зал на період святкування та +60 хв після свята\nДо 10 учасників",
    weekday: 14000, weekend: 16000, sortOrder: 1,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "laser", durationMin: 60, order: O.laser },
      { key: "banquet", durationMin: 180, order: O.banquet },
    ],
  },
  {
    locationSlug: "gorodok", key: "gorodok-premium", icon: "⭐", maxPeople: 10,
    nameUk: "Комплекс «Преміум» (3,5 години)", nameRu: "Комплекс «Премиум» (3,5 часа)", nameEn: "“Premium” package (3.5h)",
    perksUk: "Ведучий програми\n60 хв – Квест\n30 хв – Лазертаг\n30 хв – Неонове паперове шоу\n30 хв – Пазли\nБанкетний зал на період святкування та +60 хв після свята\nДо 10 учасників",
    weekday: 20500, weekend: 23500, sortOrder: 2,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "laser", durationMin: 30, order: O.laser },
      { key: "papershow", durationMin: 30, order: O.papershow },
      { key: "puzzles", durationMin: 30, order: O.puzzles },
      { key: "banquet", durationMin: 210, order: O.banquet },
    ],
  },
  {
    locationSlug: "gorodok", key: "gorodok-vipall", icon: "💎", maxPeople: 10,
    nameUk: "VIP «Все включено» (5,5 годин)", nameRu: "VIP «Всё включено» (5,5 часов)", nameEn: "VIP “All inclusive” (5.5h)",
    perksUk: "Ведучий програми\n60 хв – Квест\n60 хв – Сценарний лазертаг\n30 хв – Паперове неонове шоу\n30 хв – Лазерний лабіринт\n30 хв – Гри в кальмара\n30 хв – Пазли\n30 хв – Неотрек\nБанкетний зал на період святкування +60 хв після активності\nПіньята\nФірмові подарунки*\nДо 10 учасників",
    weekday: 46200, weekend: 51700, sortOrder: 3,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "scenario", durationMin: 60, order: O.scenario },
      { key: "papershow", durationMin: 30, order: O.papershow },
      { key: "maze", durationMin: 30, order: O.maze },
      { key: "squid", durationMin: 30, order: O.squid },
      { key: "puzzles", durationMin: 30, order: O.puzzles },
      { key: "neotrek", durationMin: 30, order: O.neotrek },
      { key: "banquet", durationMin: 330, order: O.banquet },
    ],
  },

  // ---------- ТРЦ New Way ----------
  {
    locationSlug: "new-way", key: "newway-stalker", icon: "🎯", maxPeople: 6,
    nameUk: "Комплекс «Сталкер»", nameRu: "Комплекс «Сталкер»", nameEn: "“Stalker” package",
    perksUk: STALKER_PERKS, weekday: 8700, weekend: 9000, sortOrder: 1,
    items: [{ key: "scenario", durationMin: 60, order: O.scenario }],
  },
  {
    locationSlug: "new-way", key: "newway-gold", icon: "🥇", maxPeople: 10,
    nameUk: "Комплекс «Золотий стандарт»", nameRu: "Комплекс «Золотой стандарт»", nameEn: "“Gold standard” package",
    perksUk: "60 хвилин – Лазертаг\n60 хвилин – Квест «Місія Нездійсненна»\n60 хвилин – Банкетна кімната\nВедучий програми\nДо 10 учасників",
    weekday: 12000, weekend: 14000, sortOrder: 2,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "laser", durationMin: 60, order: O.laser },
      { key: "banquet", durationMin: 60, order: O.banquet },
    ],
  },
  {
    locationSlug: "new-way", key: "newway-vip", icon: "👑", maxPeople: 10,
    nameUk: "Комплекс «VIP PARTY»", nameRu: "Комплекс «VIP PARTY»", nameEn: "“VIP PARTY” package",
    perksUk: "60 хвилин – Лазертаг «Сталкер»\n60 хвилин – Квест на вибір\n60 хвилин – Паперове шоу\n3,5 години – Банкетна кімната\nПіньята***\nФірмові подарунки**\nВиніс торту\nВедучий програми\nДо 10 учасників",
    weekday: 28500, weekend: 30000, sortOrder: 3,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "scenario", durationMin: 60, order: O.scenario },
      { key: "papershow", durationMin: 60, order: O.papershow },
      { key: "banquet", durationMin: 210, order: O.banquet },
    ],
  },

  // ---------- ТРЦ DREAM Yellow ----------
  {
    locationSlug: "dream-yellow", key: "dream-stalker", icon: "🎯", maxPeople: 6,
    nameUk: "Комплекс «Сталкер»", nameRu: "Комплекс «Сталкер»", nameEn: "“Stalker” package",
    perksUk: STALKER_PERKS, weekday: 8700, weekend: 9000, sortOrder: 1,
    items: [{ key: "scenario", durationMin: 60, order: O.scenario }],
  },
  {
    locationSlug: "dream-yellow", key: "dream-gold", icon: "🥇", maxPeople: 10,
    nameUk: "Комплекс «Золотий стандарт»", nameRu: "Комплекс «Золотой стандарт»", nameEn: "“Gold standard” package",
    perksUk: "60 хвилин – Квест «Антивірус»\n60 хвилин – Лазертаг\n60 хвилин – Банкетна кімната\nВедучий програми\nДо 10 учасників",
    weekday: 12000, weekend: 14000, sortOrder: 2,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "laser", durationMin: 60, order: O.laser },
      { key: "banquet", durationMin: 60, order: O.banquet },
    ],
  },
  {
    locationSlug: "dream-yellow", key: "dream-vip", icon: "👑", maxPeople: 10,
    nameUk: "Комплекс «VIP PARTY»", nameRu: "Комплекс «VIP PARTY»", nameEn: "“VIP PARTY” package",
    perksUk: "60 хвилин – Лазертаг «Сталкер»\n60 хвилин – Квест на вибір\n30 хвилин – Паперове шоу\n3,5 години – Банкетна кімната\nПіньята***\nФірмові подарунки**\nВиніс торту\nВедучий програми\nДо 10 учасників",
    weekday: 28500, weekend: 30000, sortOrder: 3,
    items: [
      { key: "quest", durationMin: 60, order: O.quest },
      { key: "scenario", durationMin: 60, order: O.scenario },
      { key: "papershow", durationMin: 30, order: O.papershow },
      { key: "banquet", durationMin: 210, order: O.banquet },
    ],
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
