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
  // true => створена, але прихована з сайту (active=false)
  hidden?: boolean;
  // Locations where this activity is offered (slugs).
  locations: string[];
  // Rooms/arenas per location (parallel groups). Default 1.
  capacities?: Record<string, number>;
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
    minPeople: 1,
    maxPeople: 999,
    sortOrder: 1,
    locations: ALL,
    // Городок: велика арена ділиться на дві — дві гри паралельно.
    capacities: { gorodok: 2 },
    // Same lasertag prices for all locations. (10-min tariff 180/200 also exists
    // but the calendar offers 30/60; can be added later if needed.)
    prices: [
      { durationMin: 30, weekday: 400, weekend: 500 },
      { durationMin: 60, weekday: 700, weekend: 800 },
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
    minPeople: 1,
    maxPeople: 999,
    sortOrder: 2,
    locations: ALL,
    prices: [{ weekday: 950, weekend: 1000 }],
  },
  {
    key: "quest",
    category: "game",
    nameUk: "Квест",
    nameRu: "Квест",
    nameEn: "Quest",
    descUk: "командна розумова гра",
    descRu: "командная логическая игра",
    descEn: "team puzzle game",
    icon: "🔍",
    perPerson: false,
    durationMin: 60,
    cleanupMin: 15, // 15–20 хв на перегрузку; у завантажені дні можна без зазору
    minPeople: 1,
    maxPeople: 10,
    sortOrder: 3,
    locations: ALL,
    prices: [{ weekday: 4000, weekend: 5000 }],
  },
  {
    key: "papershow",
    category: "show",
    nameUk: "Паперове шоу",
    nameRu: "Бумажное шоу",
    nameEn: "Paper show",
    descUk: "яскраве шоу з паперу",
    descRu: "яркое бумажное шоу",
    descEn: "vibrant paper show",
    icon: "🎉",
    perPerson: false,
    durationMin: 30,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 10,
    sortOrder: 4,
    // У Городку замість звичайного — паперове неонове шоу (окрема позиція).
    locations: ["nyvky", "new-way", "dream-yellow"],
    prices: [{ weekday: 5000, weekend: 5000 }],
  },
  {
    key: "paperneon",
    category: "show",
    nameUk: "Паперове неонове шоу",
    nameRu: "Бумажное неоновое шоу",
    nameEn: "Neon paper show",
    descUk: "неонове шоу з паперу",
    descRu: "неоновое бумажное шоу",
    descEn: "neon paper show",
    icon: "✨",
    perPerson: false,
    durationMin: 30,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 10,
    sortOrder: 4,
    locations: ["gorodok"],
    prices: [{ weekday: 5000, weekend: 5000 }],
  },
  {
    key: "maze",
    category: "game",
    nameUk: "Лабіринт «Хранитель Тіней»",
    nameRu: "Лабиринт «Хранитель Теней»",
    nameEn: "Maze “Shadow Keeper”",
    descUk:
      "Діти мають знайти всі промені світла та ключі, але Хранитель не хоче віддавати свої скарби та блукає лабіринтом у пошуках тих, кого можна «залякати» та вибити з гри.",
    descRu:
      "Дети должны найти все лучи света и ключи, но Хранитель не хочет отдавать свои сокровища и бродит по лабиринту в поисках тех, кого можно «напугать» и выбить из игры.",
    descEn:
      "Kids must find all the light beams and keys, but the Keeper won't give up its treasures and roams the maze looking for someone to scare out of the game.",
    icon: "🌀",
    perPerson: false,
    durationMin: 60,
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 10,
    sortOrder: 5,
    // Поки що прихована: окремої кімнати під «Хранителя Тіней» немає.
    hidden: true,
    locations: ALL,
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
    durationOptions: [30, 60],
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 999,
    sortOrder: 6,
    locations: ["gorodok"],
    prices: [
      { durationMin: 30, weekday: 400, weekend: 500 },
      { durationMin: 60, weekday: 700, weekend: 800 },
    ],
  },
  {
    key: "lasermaze",
    category: "game",
    nameUk: "Лазерний лабіринт",
    nameRu: "Лазерный лабиринт",
    nameEn: "Laser maze",
    descUk: "пройди крізь лазерні промені",
    descRu: "пройди сквозь лазерные лучи",
    descEn: "make it through the laser beams",
    icon: "🔦",
    perPerson: true,
    durationMin: 30,
    durationOptions: [30, 60],
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 999,
    sortOrder: 6,
    locations: ["gorodok"],
    prices: [
      { durationMin: 30, weekday: 400, weekend: 500 },
      { durationMin: 60, weekday: 700, weekend: 800 },
    ],
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
    durationMin: 30,
    durationOptions: [30, 60],
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 999,
    sortOrder: 7,
    locations: ["gorodok"],
    prices: [
      { durationMin: 30, weekday: 400, weekend: 500 },
      { durationMin: 60, weekday: 700, weekend: 800 },
    ],
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
    durationOptions: [30, 60],
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 999,
    sortOrder: 7,
    locations: ["gorodok"],
    prices: [
      { durationMin: 30, weekday: 400, weekend: 500 },
      { durationMin: 60, weekday: 700, weekend: 800 },
    ],
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
    durationOptions: [30, 60], // можна обирати 30 або 60 хв
    cleanupMin: 0,
    minPeople: 1,
    maxPeople: 999,
    sortOrder: 8,
    locations: ALL,
    // Кількість банкетних кімнат: Нивки 2 (космос мала/велика), New Way 3
    // (космос, каюта, майнкрафт), Дрім 1, Городок 7 (космос, 2 каюти,
    // майнкрафт, динозаври, аватар, Гаррі Поттер).
    capacities: { nyvky: 2, "new-way": 3, "dream-yellow": 1, gorodok: 7 },
    prices: [
      { durationMin: 30, weekday: 500, weekend: 500 },
      { durationMin: 60, weekday: 1000, weekend: 1000 },
    ],
  },
];

export const ADDONS = [
  { key: "pinata", nameUk: "Піньята-сюрприз", nameRu: "Пиньята-сюрприз", nameEn: "Piñata surprise", subUk: "1 кг цукерок, тематика на вибір з локації", subRu: "1 кг конфет, тематика на выбор из локации", subEn: "1 kg of sweets, theme of your choice", price: 1200, sortOrder: 1 },
  { key: "pinata-custom", nameUk: "Піньята під замовлення", nameRu: "Пиньята под заказ", nameEn: "Custom piñata", subUk: "", subRu: "", subEn: "", price: 1400, sortOrder: 2 },
  { key: "pinata-own", nameUk: "Своя піньята", nameRu: "Своя пиньята", nameEn: "Bring-your-own piñata", subUk: "", subRu: "", subEn: "", price: 500, sortOrder: 3 },
  { key: "animator", nameUk: "Аніматор", nameRu: "Аниматор", nameEn: "Animator", subUk: "2 години · 1 аніматор", subRu: "2 часа · 1 аниматор", subEn: "2 hours · 1 animator", price: 3000, sortOrder: 4 },
  // Професійний фотограф: 1 год — 2500, 2 год — 4000, 3 год — 5500.
  { key: "photographer", nameUk: "Професійний фотограф", nameRu: "Профессиональный фотограф", nameEn: "Professional photographer", subUk: "оберіть кількість годин (максимум 3 години)", subRu: "выберите количество часов (максимум 3 часа)", subEn: "choose the number of hours (up to 3)", price: 2500, tiers: { 1: 2500, 2: 4000, 3: 5500 }, sortOrder: 5 },
  // Торт: ціна залежить від ваги, начинки та дизайну — узгоджується з менеджером.
  { key: "cake", nameUk: "Святковий торт", nameRu: "Праздничный торт", nameEn: "Cake", subUk: "ціна залежить від ваги, начинки та дизайну", subRu: "цена зависит от веса, начинки и дизайна", subEn: "price depends on weight, filling and design", price: 0, sortOrder: 6 },
  { key: "merch", nameUk: "Мерч нашої компанії", nameRu: "Мерч нашей компании", nameEn: "Our merch", subUk: "футболки у двох кольорах, брендовані чашки, неонові браслетики", subRu: "футболки в двух цветах, брендированные чашки, неоновые браслетики", subEn: "t-shirts in two colours, branded cups, neon bracelets", price: 0, sortOrder: 7 },
  { key: "arena", nameUk: "Індивідуальне закриття арени", nameRu: "Индивидуальное закрытие арены", nameEn: "Private arena", subUk: "лазертаг тільки для вас, 1 год", subRu: "лазертаг только для вас, 1 час", subEn: "lasertag just for you, 1h", price: 14000, sortOrder: 8 },
];

// ---------------------------------------------------------------------------
// Кімнати на локаціях (зі слів клієнта). Розвага займає одну з призначених їй
// кімнат; розваги зі спільною кімнатою (лазертаг і сценарний на одній арені,
// квест на арені Дріму) блокують одна одну автоматично.
export type SeedRoom = { loc: string; key: string; name: string; note?: string };

export const ROOMS: SeedRoom[] = [
  // ---- Нивки ----
  { loc: "nyvky", key: "arena", name: "Лазертаг-арена" },
  { loc: "nyvky", key: "papershow", name: "Кімната паперового шоу" },
  { loc: "nyvky", key: "quest", name: "Квест-кімната" },
  { loc: "nyvky", key: "banquet-cosmos-s", name: "Банкетна «Космос» мала", note: "до 10 дітей" },
  { loc: "nyvky", key: "banquet-cosmos-l", name: "Банкетна «Космос» велика", note: "до 25–30 дітей" },
  // ---- New Way ----
  { loc: "new-way", key: "arena", name: "Лазертаг-арена" },
  { loc: "new-way", key: "papershow", name: "Кімната паперового шоу" },
  { loc: "new-way", key: "quest", name: "Квест-кімната" },
  { loc: "new-way", key: "banquet-cosmos", name: "Банкетна «Космос»", note: "до 25 дітей" },
  { loc: "new-way", key: "banquet-kayuta", name: "Банкетна «Каюта»", note: "до 10–12 дітей" },
  { loc: "new-way", key: "banquet-minecraft", name: "Банкетна «Майнкрафт»", note: "до 10–12 дітей" },
  // ---- Дрім ----
  { loc: "dream-yellow", key: "arena", name: "Лазертаг-арена / квест-зона", note: "арена ділиться на квестову зону" },
  { loc: "dream-yellow", key: "papershow", name: "Кімната паперового шоу" },
  { loc: "dream-yellow", key: "banquet", name: "Банкетна кімната", note: "до 20 дітей" },
  // ---- Городок ----
  { loc: "gorodok", key: "arena-a", name: "Лазертаг-арена А", note: "велика арена ділиться на дві" },
  { loc: "gorodok", key: "arena-b", name: "Лазертаг-арена Б" },
  { loc: "gorodok", key: "quest", name: "Квест-зона" },
  { loc: "gorodok", key: "papershow", name: "Кімната паперового шоу" },
  { loc: "gorodok", key: "squid", name: "Кімната «Гра в кальмара»" },
  { loc: "gorodok", key: "neotrek", name: "Кімната «Неотрек»" },
  { loc: "gorodok", key: "puzzles", name: "Кімната «Пазли»" },
  { loc: "gorodok", key: "lasermaze", name: "Кімната «Лазерний лабіринт»" },
  { loc: "gorodok", key: "showroom", name: "Кімната шоу-програм", note: "партнерські шоу — бронює менеджер" },
  { loc: "gorodok", key: "banquet-cosmos", name: "Банкетна «Космос»" },
  { loc: "gorodok", key: "banquet-kayuta-1", name: "Банкетна «Каюта 1»" },
  { loc: "gorodok", key: "banquet-kayuta-2", name: "Банкетна «Каюта 2»" },
  { loc: "gorodok", key: "banquet-minecraft", name: "Банкетна «Майнкрафт»" },
  { loc: "gorodok", key: "banquet-dino", name: "Банкетна «Динозаври»" },
  { loc: "gorodok", key: "banquet-avatar", name: "Банкетна «Аватар»" },
  { loc: "gorodok", key: "banquet-potter", name: "Банкетна «Гаррі Поттер»" },
];

// activityKey -> room refs "loc:key". Лазертаг і сценарний ділять арени;
// квест на Дрімі проводиться на арені (ділиться на квестову зону).
export const ACTIVITY_ROOMS: Record<string, string[]> = {
  laser: ["nyvky:arena", "new-way:arena", "dream-yellow:arena", "gorodok:arena-a", "gorodok:arena-b"],
  scenario: ["nyvky:arena", "new-way:arena", "dream-yellow:arena", "gorodok:arena-a", "gorodok:arena-b"],
  quest: ["nyvky:quest", "new-way:quest", "dream-yellow:arena", "gorodok:quest"],
  papershow: ["nyvky:papershow", "new-way:papershow", "dream-yellow:papershow"],
  paperneon: ["gorodok:papershow"],
  squid: ["gorodok:squid"],
  neotrek: ["gorodok:neotrek"],
  puzzles: ["gorodok:puzzles"],
  lasermaze: ["gorodok:lasermaze"],
  banquet: [
    "nyvky:banquet-cosmos-s", "nyvky:banquet-cosmos-l",
    "new-way:banquet-cosmos", "new-way:banquet-kayuta", "new-way:banquet-minecraft",
    "dream-yellow:banquet",
    "gorodok:banquet-cosmos", "gorodok:banquet-kayuta-1", "gorodok:banquet-kayuta-2",
    "gorodok:banquet-minecraft", "gorodok:banquet-dino", "gorodok:banquet-avatar", "gorodok:banquet-potter",
  ],
};


// Рядкові переклади пунктів комплексів (RU/EN). Невідомі рядки лишаються укр.
const PERK_RU: Record<string, string> = {
  "Ведучий програми": "Ведущий программы",
  "Фірмові подарунки*": "Фирменные подарки*",
  "Фірмові подарунки**": "Фирменные подарки**",
  "До 6 учасників": "До 6 участников",
  "До 10 учасників": "До 10 участников",
  "Піньята": "Пиньята",
  "Піньята***": "Пиньята***",
  "Виніс торту": "Вынос торта",
  "60 хвилин – Лазертаг «Сталкер»": "60 минут – Лазертаг «Сталкер»",
  "60 хвилин – Лазертаг": "60 минут – Лазертаг",
  "60 хвилин – Квест «Антивірус»": "60 минут – Квест «Антивирус»",
  "60 хвилин – Квест «Місія Нездійсненна»": "60 минут – Квест «Миссия невыполнима»",
  "60 хвилин – Квест на вибір": "60 минут – Квест на выбор",
  "60 хвилин – Банкетна кімната": "60 минут – Банкетная комната",
  "60 хвилин – Паперове шоу": "60 минут – Бумажное шоу",
  "30 хвилин – Паперове шоу": "30 минут – Бумажное шоу",
  "3,5 години – Банкетна кімната": "3,5 часа – Банкетная комната",
  "60 хв – Квест": "60 мин – Квест",
  "60 хв – Лазертаг": "60 мин – Лазертаг",
  "30 хв – Лазертаг": "30 мин – Лазертаг",
  "60 хв – Сценарний лазертаг": "60 мин – Сценарный лазертаг",
  "30 хв – Неонове паперове шоу": "30 мин – Неоновое бумажное шоу",
  "30 хв – Паперове неонове шоу": "30 мин – Бумажное неоновое шоу",
  "30 хв – Пазли": "30 мин – Пазлы",
  "30 хв – Лазерний лабіринт": "30 мин – Лазерный лабиринт",
  "30 хв – Гри в кальмара": "30 мин – Игры в кальмара",
  "30 хв – Неотрек": "30 мин – Неотрек",
  "Банкетний зал на період святкування та +60 хв після свята":
    "Банкетный зал на период праздника и +60 мин после праздника",
  "Банкетний зал на період святкування +60 хв після активності":
    "Банкетный зал на период праздника +60 мин после активностей",
};

const PERK_EN: Record<string, string> = {
  "Ведучий програми": "Party host",
  "Фірмові подарунки*": "Branded gifts*",
  "Фірмові подарунки**": "Branded gifts**",
  "До 6 учасників": "Up to 6 guests",
  "До 10 учасників": "Up to 10 guests",
  "Піньята": "Piñata",
  "Піньята***": "Piñata***",
  "Виніс торту": "Cake ceremony",
  "60 хвилин – Лазертаг «Сталкер»": "60 min – “Stalker” lasertag",
  "60 хвилин – Лазертаг": "60 min – Lasertag",
  "60 хвилин – Квест «Антивірус»": "60 min – “Antivirus” quest",
  "60 хвилин – Квест «Місія Нездійсненна»": "60 min – “Mission Impossible” quest",
  "60 хвилин – Квест на вибір": "60 min – Quest of your choice",
  "60 хвилин – Банкетна кімната": "60 min – Banquet room",
  "60 хвилин – Паперове шоу": "60 min – Paper show",
  "30 хвилин – Паперове шоу": "30 min – Paper show",
  "3,5 години – Банкетна кімната": "3.5 h – Banquet room",
  "60 хв – Квест": "60 min – Quest",
  "60 хв – Лазертаг": "60 min – Lasertag",
  "30 хв – Лазертаг": "30 min – Lasertag",
  "60 хв – Сценарний лазертаг": "60 min – Scenario lasertag",
  "30 хв – Неонове паперове шоу": "30 min – Neon paper show",
  "30 хв – Паперове неонове шоу": "30 min – Neon paper show",
  "30 хв – Пазли": "30 min – Puzzles",
  "30 хв – Лазерний лабіринт": "30 min – Laser maze",
  "30 хв – Гри в кальмара": "30 min – Squid games",
  "30 хв – Неотрек": "30 min – Neotrek",
  "Банкетний зал на період святкування та +60 хв після свята":
    "Banquet room for the whole party + 60 min after",
  "Банкетний зал на період святкування +60 хв після активності":
    "Banquet room for the whole party + 60 min after the activities",
};

export function perksToRu(perksUk: string): string {
  return perksUk.split("\n").map((l) => PERK_RU[l.trim()] ?? l).join("\n");
}
export function perksToEn(perksUk: string): string {
  return perksUk.split("\n").map((l) => PERK_EN[l.trim()] ?? l).join("\n");
}

// Complex offers ("комплекси"). Location-specific — content and prices differ.
// `items` is the bookable sequence placed on the calendar. Non-room items run
// consecutively in the client's recommended order (quest → lasertag → paper
// show → …); room items (banquet) are reserved in parallel for the whole event.
// `perksUk` is the full display bullet list (one perk per line), including
// non-bookable inclusions (host, gifts, piñata, cake take-out).
export type SeedPackageItem = { key: string; durationMin: number; order: number; parallel?: boolean };
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
      { key: "banquet", durationMin: 210, order: O.banquet, parallel: true },
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
      { key: "banquet", durationMin: 180, order: O.banquet, parallel: true },
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
      { key: "paperneon", durationMin: 30, order: O.papershow },
      { key: "puzzles", durationMin: 30, order: O.puzzles },
      { key: "banquet", durationMin: 210, order: O.banquet, parallel: true },
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
      { key: "paperneon", durationMin: 30, order: O.papershow },
      { key: "lasermaze", durationMin: 30, order: O.maze },
      { key: "squid", durationMin: 30, order: O.squid },
      { key: "puzzles", durationMin: 30, order: O.puzzles },
      { key: "neotrek", durationMin: 30, order: O.neotrek },
      { key: "banquet", durationMin: 330, order: O.banquet, parallel: true },
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
      { key: "banquet", durationMin: 210, order: O.banquet, parallel: true },
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
      { key: "banquet", durationMin: 210, order: O.banquet, parallel: true },
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
