import { type Locale } from "./constants";

export type Dict = typeof uk;

const uk = {
  // header
  brandName: "Центр розваг Лазертаг G-75",
  brandSub: "лазертаг · квести · свята",
  bookByPhone: "Бажаєте забронювати за телефоном?",
  callUs: "Зателефонуйте нам:",
  orMessengers: "або напишіть у месенджер:",
  viber: "Viber",
  telegram: "Telegram",
  // page
  title: "Онлайн бронювання",
  subtitle: "Оберіть дату, локацію та розваги — ми підготуємо ідеальне свято",
  weekendBadge: "Вихідний тариф",
  stepDate: "ДАТА СВЯТА",
  stepLocation: "ЛОКАЦІЯ",
  stepPeople: "УЧАСНИКИ",
  stepPhone: "ВАШ ТЕЛЕФОН",
  phonePlaceholder: "+38 (0__) ___ __ __",
  namePlaceholder: "Ваше ім'я",
  chooseActs: "Оберіть розваги",
  chooseActsHint: "можна кілька — календар нижче покаже вільний час для кожної",
  packagesTitle: "Комплексні пропозиції",
  packagesHint: "готова програма свята — оберіть комплекс і зручний час старту",
  pkgChoose: "Обрати комплекс",
  pkgHideTimes: "Приховати час",
  pkgStartTime: "ЧАС ПОЧАТКУ КОМПЛЕКСУ",
  pkgMaxPeople: "У цьому комплексі максимум {max} учасників. Зменшіть кількість у кроці 3 (Учасники) вгорі.",
  pkgNoTime: "На цю дату немає вільного часу для всього комплексу. Оберіть іншу дату.",
  pkgIncludes: "Комплекс включає",
  pkgShowMore: "Показати все ({n})",
  pkgShowLess: "Згорнути",
  durationLaser: "Тривалість лазертагу:",
  durationLabel: "Тривалість:",
  min: "хв",
  perPerson: "/ людину",
  perGroup: "/ компанію",
  calendarTitle: "КАЛЕНДАР ВІЛЬНОГО ЧАСУ",
  chooseAtLeastOne: "Оберіть хоча б одну розвагу вище",
  legendFree: "вільно",
  legendYours: "ваш вибір",
  legendBusy: "зайнято",
  addonsTitle: "Додайте до свята",
  add: "Додати",
  added: "Додано",
  remove: "Прибрати",
  yourBooking: "Ваше бронювання",
  cartEmpty: "Оберіть розвагу та час зліва — вони з'являться тут",
  total: "Загальна сума",
  uah: "грн",
  book: "Забронювати",
  managerWillCall: "Менеджер зв'яжеться з вами для підтвердження",
  prepayNote: "Для підтвердження дати потрібен аванс 1000 грн (переказ на картку ФОП).",
  submitted: "Заявку надіслано!",
  submittedText:
    "Ваш номер бронювання нижче. Натисніть «Підтвердити у Telegram», щоб ми одразу зв'язали заявку з вами. Або чекайте дзвінка на {phone}.",
  confirmTelegram: "Підтвердити у Telegram",
  newBooking: "Нове бронювання",
  bookingCode: "Номер бронювання",
  // validation
  errPhone: "Вкажіть номер телефону",
  errEmpty: "Додайте хоча б одну розвагу",
  errPeople: "Вкажіть кількість учасників",
  // notes
  notes: [
    "* Під час проведення свята можуть грати й інші учасники. Індивідуальне закриття арени для гри в лазертаг під вашу компанію на одну годину — 14 000 грн.",
    "** Подарунки надаються виключно для учасників, які беруть участь у розвагах на святі.",
    "*** Якщо ви бажаєте принести піньяту з собою — це коштує 500 грн (забороняється наповнення конфеті, льодяники Chupa Chups та скляні іграшки).",
    "**** У разі відмови від святкування або зміни дати менше ніж за 10 днів до події, внесений аванс не повертається у грошовій формі. Сплачена сума зберігається у вигляді сертифіката на послуги центру, дійсного 3 місяці з дати первинного бронювання.",
  ],
};

const ru: Dict = {
  brandName: "Центр развлечений Лазертаг G-75",
  brandSub: "лазертаг · квесты · праздники",
  bookByPhone: "Хотите забронировать по телефону?",
  callUs: "Позвоните нам:",
  orMessengers: "или напишите в мессенджер:",
  viber: "Viber",
  telegram: "Telegram",
  title: "Онлайн бронирование",
  subtitle: "Выберите дату, локацию и развлечения — мы подготовим идеальный праздник",
  weekendBadge: "Выходной тариф",
  stepDate: "ДАТА ПРАЗДНИКА",
  stepLocation: "ЛОКАЦИЯ",
  stepPeople: "УЧАСТНИКИ",
  stepPhone: "ВАШ ТЕЛЕФОН",
  phonePlaceholder: "+38 (0__) ___ __ __",
  namePlaceholder: "Ваше имя",
  chooseActs: "Выберите развлечения",
  chooseActsHint: "можно несколько — календарь ниже покажет свободное время для каждого",
  packagesTitle: "Комплексные предложения",
  packagesHint: "готовая программа праздника — выберите комплекс и удобное время старта",
  pkgChoose: "Выбрать комплекс",
  pkgHideTimes: "Скрыть время",
  pkgStartTime: "ВРЕМЯ НАЧАЛА КОМПЛЕКСА",
  pkgMaxPeople: "В этом комплексе максимум {max} участников. Уменьшите количество в шаге 3 (Участники) вверху.",
  pkgNoTime: "На эту дату нет свободного времени для всего комплекса. Выберите другую дату.",
  pkgIncludes: "Комплекс включает",
  pkgShowMore: "Показать всё ({n})",
  pkgShowLess: "Свернуть",
  durationLaser: "Длительность лазертага:",
  durationLabel: "Длительность:",
  min: "мин",
  perPerson: "/ человека",
  perGroup: "/ компанию",
  calendarTitle: "КАЛЕНДАРЬ СВОБОДНОГО ВРЕМЕНИ",
  chooseAtLeastOne: "Выберите хотя бы одно развлечение выше",
  legendFree: "свободно",
  legendYours: "ваш выбор",
  legendBusy: "занято",
  addonsTitle: "Добавьте к празднику",
  add: "Добавить",
  added: "Добавлено",
  remove: "Убрать",
  yourBooking: "Ваше бронирование",
  cartEmpty: "Выберите развлечение и время слева — они появятся здесь",
  total: "Общая сумма",
  uah: "грн",
  book: "Забронировать",
  managerWillCall: "Менеджер свяжется с вами для подтверждения",
  prepayNote: "Для подтверждения даты нужен аванс 1000 грн (перевод на карту ФОП).",
  submitted: "Заявка отправлена!",
  submittedText:
    "Ваш номер брони ниже. Нажмите «Подтвердить в Telegram», чтобы мы сразу связали заявку с вами. Или ждите звонка на {phone}.",
  confirmTelegram: "Подтвердить в Telegram",
  newBooking: "Новое бронирование",
  bookingCode: "Номер брони",
  errPhone: "Укажите номер телефона",
  errEmpty: "Добавьте хотя бы одно развлечение",
  errPeople: "Укажите количество участников",
  notes: [
    "* Во время праздника могут играть и другие участники. Индивидуальное закрытие арены для игры в лазертаг под вашу компанию на один час — 14 000 грн.",
    "** Подарки предоставляются исключительно участникам развлечений на празднике.",
    "*** Если вы хотите принести пиньяту с собой — это стоит 500 грн (запрещено наполнение конфетти, леденцы Chupa Chups и стеклянные игрушки).",
    "**** При отказе или переносе даты менее чем за 10 дней аванс не возвращается деньгами, а сохраняется в виде сертификата на услуги центра сроком на 3 месяца.",
  ],
};

const en: Dict = {
  brandName: "G-75 Lasertag Entertainment Center",
  brandSub: "lasertag · quests · parties",
  bookByPhone: "Prefer to book by phone?",
  callUs: "Call us:",
  orMessengers: "or message us:",
  viber: "Viber",
  telegram: "Telegram",
  title: "Online booking",
  subtitle: "Pick a date, location and activities — we'll prepare the perfect party",
  weekendBadge: "Weekend rate",
  stepDate: "PARTY DATE",
  stepLocation: "LOCATION",
  stepPeople: "GUESTS",
  stepPhone: "YOUR PHONE",
  phonePlaceholder: "+38 (0__) ___ __ __",
  namePlaceholder: "Your name",
  chooseActs: "Choose activities",
  chooseActsHint: "pick several — the calendar below shows free time for each",
  packagesTitle: "Party packages",
  packagesHint: "a ready party programme — pick a package and a convenient start time",
  pkgChoose: "Choose package",
  pkgHideTimes: "Hide times",
  pkgStartTime: "PACKAGE START TIME",
  pkgMaxPeople: "This package allows up to {max} guests. Reduce the number in step 3 (Guests) above.",
  pkgNoTime: "No free time for the whole package on this date. Please pick another date.",
  pkgIncludes: "The package includes",
  pkgShowMore: "Show all ({n})",
  pkgShowLess: "Show less",
  durationLaser: "Lasertag duration:",
  durationLabel: "Duration:",
  min: "min",
  perPerson: "/ person",
  perGroup: "/ group",
  calendarTitle: "AVAILABLE TIME",
  chooseAtLeastOne: "Choose at least one activity above",
  legendFree: "free",
  legendYours: "your pick",
  legendBusy: "busy",
  addonsTitle: "Add to your party",
  add: "Add",
  added: "Added",
  remove: "Remove",
  yourBooking: "Your booking",
  cartEmpty: "Pick an activity and time on the left — they'll show up here",
  total: "Total",
  uah: "UAH",
  book: "Book now",
  managerWillCall: "A manager will contact you to confirm",
  prepayNote: "A 1000 UAH prepayment (transfer to the FOP card) is required to confirm the date.",
  submitted: "Request sent!",
  submittedText:
    "Your booking code is below. Tap “Confirm on Telegram” so we can link the request to you right away. Or wait for a call at {phone}.",
  confirmTelegram: "Confirm on Telegram",
  newBooking: "New booking",
  bookingCode: "Booking code",
  errPhone: "Please enter a phone number",
  errEmpty: "Add at least one activity",
  errPeople: "Enter the number of guests",
  notes: [
    "* Other guests may also play during your party. A private arena for your group for one hour costs 14,000 UAH.",
    "** Gifts are provided only to guests taking part in the party activities.",
    "*** Bringing your own piñata costs 500 UAH (no confetti filling, Chupa Chups or glass toys allowed).",
    "**** Cancelling or rescheduling less than 10 days before the event: the prepayment is kept as a 3-month service certificate rather than refunded in cash.",
  ],
};

const DICTS: Record<Locale, Dict> = { uk, ru, en };

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? uk;
}

export function localizedName<T extends { nameUk: string; nameRu: string; nameEn: string }>(
  o: T,
  locale: Locale
): string {
  if (locale === "ru") return o.nameRu || o.nameUk;
  if (locale === "en") return o.nameEn || o.nameUk;
  return o.nameUk;
}

export function localizedDesc<T extends { descUk: string; descRu: string; descEn: string }>(
  o: T,
  locale: Locale
): string {
  if (locale === "ru") return o.descRu || o.descUk;
  if (locale === "en") return o.descEn || o.descUk;
  return o.descUk;
}

export function localizedSub<T extends { subUk: string; subRu: string; subEn: string }>(
  o: T,
  locale: Locale
): string {
  if (locale === "ru") return o.subRu || o.subUk;
  if (locale === "en") return o.subEn || o.subUk;
  return o.subUk;
}
