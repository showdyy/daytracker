// Деньги: разбор трат, категории, бюджет и подсказки «где сэкономить». Подключается к core.js через Core.money.
(function () {
  'use strict';
  const CATS = [
    {k: 'cafe', n: 'Кафе и доставка', ic: '🍔', c: '#FF9B7A', kw: ['кафе', 'кофе', 'капучино', 'латте', 'раф', 'ресторан', 'бургер', 'шаурм', 'шаверм', 'пицц', 'доставк', 'суши', 'ролл', 'обед', 'ужин', 'завтрак', 'фастфуд', 'kfc', 'кфс', 'макдон', 'вкусно и точка', 'starbucks', 'столов', 'перекус', 'выпечк', 'булочк', 'глово', 'glovo', 'wolt', 'яндекс еда', 'чайхан', 'кофейн', 'донер', 'хот-дог', 'хотдог']},
    {k: 'grocery', n: 'Продукты', ic: '🛒', c: '#86D69A', kw: ['продукт', 'магазин', 'супермаркет', 'магнум', 'magnum', 'small', 'смолл', 'пятерочк', 'пятёрочк', 'перекрест', 'лента', 'ашан', 'рынок', 'базар', 'молоко', 'хлеб', 'овощ', 'фрукт', 'мясо', 'яйц', 'крупа', 'гречк', 'galmart', 'галмарт', 'арзан', 'airba', 'вкусвилл', 'дикси', 'магнит']},
    {k: 'transport', n: 'Транспорт', ic: '🚕', c: '#7FB6F0', kw: ['такси', 'yandex go', 'яндекс го', 'убер', 'uber', 'indrive', 'индрайв', 'инд драйв', 'бензин', 'заправк', 'топливо', 'автобус', 'метро', 'проезд', 'парковк', 'каршер', 'автомойк', 'мойка', 'шиномонтаж', 'поезд', 'самолет', 'самолёт', 'авиабилет', 'электричк', 'onay', 'онай']},
    {k: 'subs', n: 'Подписки', ic: '🔁', c: '#B9A6F5', kw: ['подписк', 'spotify', 'спотифай', 'netflix', 'нетфликс', 'youtube', 'ютуб', 'яндекс плюс', 'icloud', 'айклауд', 'apple music', 'chatgpt', 'claude', 'vpn', 'впн', 'telegram premium', 'телеграм премиум', 'кинопоиск', 'okko', 'окко', 'ivi', 'иви', 'premium', 'премиум', 'game pass', 'ps plus']},
    {k: 'fun', n: 'Развлечения', ic: '🎉', c: '#F5C46B', kw: ['кино', 'бар', 'клуб', 'концерт', 'игр', 'steam', 'стим', 'боулинг', 'караоке', 'кальян', 'пиво', 'алкогол', 'вино', 'театр', 'вечеринк', 'тусовк', 'квест', 'музей', 'выставк']},
    {k: 'shop', n: 'Покупки', ic: '🛍', c: '#F28FB0', kw: ['одежд', 'обув', 'кроссовк', 'футболк', 'худи', 'джинс', 'куртк', 'wildberries', 'вайлдберриз', 'вб ', 'ozon', 'озон', 'kaspi', 'каспи', 'алиэкспресс', 'aliexpress', 'temu', 'техник', 'наушник', 'телефон', 'чехол', 'зарядк', 'косметик', 'духи', 'парфюм', 'подарок', 'подарк']},
    {k: 'health', n: 'Здоровье и спорт', ic: '💪', c: '#6FD3C1', kw: ['аптек', 'лекарств', 'таблетк', 'врач', 'стоматолог', 'зуб', 'анализ', 'витамин', 'зал', 'абонемент', 'фитнес', 'спортпит', 'протеин', 'креатин', 'бассейн', 'массаж', 'тренер', 'барбер', 'стрижк', 'парикмахер']},
    {k: 'home', n: 'Дом и счета', ic: '🏠', c: '#C9B79C', kw: ['аренд', 'квартир', 'коммунал', 'жкх', 'свет', 'газ', 'интернет', 'связь', 'мобильн', 'баланс телефона', 'ремонт', 'мебель', 'хозтовар', 'бытов', 'порошок', 'посуд', 'кредит', 'ипотек', 'рассрочк']},
    {k: 'edu', n: 'Учёба', ic: '📚', c: '#9FC5FF', kw: ['курс', 'учеб', 'учёб', 'книг', 'обучени', 'репетитор', 'универ', 'школ', 'английск']},
    {k: 'other', n: 'Другое', ic: '📦', c: '#9B98A6', kw: []},
  ];
  const INCOME = {k: 'income', n: 'Доход', ic: '💰', c: '#86D69A'};
  const RE_INC = /^\s*\+|зарплат|(?<![а-я])зп(?![а-я])|доход|аванс|преми[яюи]|кэшбэк|кешбэк|кэшбек|стипенди|перевели мне|мне перевел|получил|подработк|фриланс/i;
  const RE_AMOUNT = /(?<![\d.,])(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?![\d])\s*(к|k|тыс[а-я]*\.?)?(?![а-яa-z])\s*(₸|тг|тенге|тнг|р\.?|руб[а-я]*\.?|₽|\$|usd|долл[а-я]*|€|eur|евро)?/i;
  const norm = s => s.toLowerCase().replace(/ё/g, 'е');

  function category(note) {
    const t = ' ' + norm(note) + ' ';
    for (const c of CATS) if (c.kw.some(k => t.includes(k))) return c.k;
    return 'other';
  }
  function parse(line) {
    const text = String(line || '').trim();
    if (!text) return null;
    const m = RE_AMOUNT.exec(text);
    if (!m) return null;
    let amount = parseFloat(m[1].replace(/[  ]/g, '') + (m[2] ? '.' + m[2] : ''));
    if (m[3]) amount *= 1000;
    if (!(amount > 0)) return null;
    const income = RE_INC.test(text);
    let note = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/^\s*\+/, '').replace(/\s+/g, ' ').replace(/^[\s,.;:\-—–]+|[\s,.;:\-—–]+$/g, '');
    const cat = income ? 'income' : category(note);
    if (!note) note = income ? 'Доход' : (CATS.find(c => c.k === cat) || CATS[CATS.length - 1]).n;
    note = note[0].toUpperCase() + note.slice(1);
    return {amount: Math.round(amount * 100) / 100, type: income ? 'inc' : 'exp', cat, note};
  }
  const catInfo = k => k === 'income' ? INCOME : (CATS.find(c => c.k === k) || CATS[CATS.length - 1]);

  /* ---------------------------------------------------------------- состояние раздела */
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

  function state(DB, today) {
    const cfg = Object.assign({budget: null, income: null, currency: '₸'}, DB.moneyCfg);
    const cur = cfg.currency, money = DB.money || [];
    const [y, mo, d] = today.split('-').map(Number);
    const month = today.slice(0, 7), daysIn = new Date(y, mo, 0).getDate(), dayNo = d;
    const prevMonth = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
    const exp = money.filter(x => x.type === 'exp'), inc = money.filter(x => x.type === 'inc');
    const mExp = exp.filter(x => x.day.startsWith(month)), mInc = inc.filter(x => x.day.startsWith(month));
    const sum = a => a.reduce((s, x) => s + x.amount, 0);
    const spent = sum(mExp), incomeLogged = sum(mInc), income = Math.max(incomeLogged, cfg.income || 0);
    const todaySpent = sum(mExp.filter(x => x.day === today));
    const perDayAvg = spent / dayNo, projection = spent + perDayAvg * (daysIn - dayNo);
    const budget = cfg.budget || null, left = budget ? budget - spent : null;
    const perDayLeft = budget ? Math.max(0, (budget - spent) / (daysIn - dayNo + 1)) : null;

    // категории этого и прошлого месяца (прошлый — за тот же период дней, честное сравнение)
    const byCat = {}, prevByCat = {};
    for (const x of mExp) byCat[x.cat] = (byCat[x.cat] || 0) + x.amount;
    for (const x of exp.filter(x => x.day.startsWith(prevMonth) && +x.day.slice(8) <= dayNo)) prevByCat[x.cat] = (prevByCat[x.cat] || 0) + x.amount;
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => Object.assign({k, sum: v, share: spent ? v / spent : 0, prev: prevByCat[k] || 0}, catInfo(k)));

    // подсказки «где сэкономить»
    const tips = [];
    const money$ = v => `${fmt(v)} ${cur}`;
    if (!mExp.length) tips.push({ic: '✍️', t: 'Записывай траты пару дней', d: 'Достаточно «кофе 250» — дальше я покажу, куда уходят деньги и где можно сэкономить.'});
    if (!budget) tips.push({ic: '🎯', t: 'Задай бюджет на месяц', d: 'Тогда я посчитаю, сколько можно тратить в день, и предупрежу, если темп слишком высокий.'});
    if (budget && mExp.length && dayNo >= 3) {
      if (projection > budget * 1.05) tips.push({ic: '⚠️', warn: true, t: `По прогнозу выйдет ${money$(projection)} — на ${money$(projection - budget)} больше бюджета`, d: `Чтобы уложиться, держись около ${money$(perDayLeft)} в день до конца месяца.`});
      else tips.push({ic: '✅', ok: true, t: 'Идёшь в рамках бюджета', d: `Прогноз на месяц — ${money$(projection)} из ${money$(budget)}. Так держать!`});
    }
    // частые мелкие покупки
    const groups = {};
    for (const x of mExp) { const key = norm(x.note).split(/[\s,]+/)[0]; if (key) (groups[key] = groups[key] || {n: x.note.split(/[\s,]+/)[0], cat: x.cat, cnt: 0, sum: 0}), groups[key].cnt++, groups[key].sum += x.amount }
    const avgTxn = mExp.length ? spent / mExp.length : 0;
    const small = Object.values(groups).filter(g => g.cnt >= 4 && g.sum / g.cnt <= avgTxn).sort((a, b) => b.sum - a.sum)[0];
    if (small) tips.push({ic: catInfo(small.cat).ic, t: `${small.n}: ${small.cnt} раз за месяц — ${money$(small.sum)}`, d: `Частые небольшие траты незаметно копятся. Сократишь вдвое — сэкономишь ~${money$(small.sum / 2)} в месяц, это ${money$(small.sum / 2 * 12)} за год.`});
    // кафе против продуктов
    const cafe = byCat.cafe || 0, groc = byCat.grocery || 0;
    if (cafe > groc && cafe > spent * 0.15) tips.push({ic: '🍳', t: 'Кафе и доставка дороже продуктов', d: `Ушло ${money$(cafe)} против ${money$(groc)} на продукты. Готовить дома хотя бы 3–4 раза в неделю — экономия около ${money$(cafe * 0.4)} в месяц.`});
    // подписки
    if (byCat.subs) tips.push({ic: '🔁', t: `Подписки: ${money$(byCat.subs)} в месяц`, d: `В год это ${money$(byCat.subs * 12)}. Проверь, всеми ли пользуешься — отписка от лишних экономит без усилий.`});
    // главная категория
    if (cats[0] && cats[0].share >= 0.35 && cats[0].k !== 'home' && mExp.length >= 5) tips.push({ic: cats[0].ic, t: `${cats[0].n} — ${Math.round(cats[0].share * 100)}% всех трат`, d: 'Больше всего денег уходит сюда. Срежешь эту категорию на 15% — сэкономишь ' + money$(cats[0].sum * 0.15 * daysIn / dayNo) + ' за месяц.'});
    // рост к прошлому месяцу
    const grow = cats.filter(c => c.prev > 0 && c.sum > c.prev * 1.3 && c.sum - c.prev > spent * 0.05).sort((a, b) => (b.sum - b.prev) - (a.sum - a.prev))[0];
    if (grow) tips.push({ic: '📈', t: `${grow.n}: +${Math.round((grow.sum / grow.prev - 1) * 100)}% к прошлому месяцу`, d: `За то же число дней было ${money$(grow.prev)}, сейчас ${money$(grow.sum)}.`});
    // доля сбережений
    if (income > 0 && mExp.length) {
      const rate = (income - projection) / income;
      if (rate < 0.1) tips.push({ic: '🏦', warn: rate < 0, t: rate < 0 ? 'Тратишь больше, чем зарабатываешь' : `Откладывается всего ${Math.round(rate * 100)}% дохода`, d: `Правило 50/30/20: 50% — на нужное, 30% — на желания, 20% — в накопления. Цель — откладывать ${money$(income * 0.2)} в месяц.`});
      else tips.push({ic: '🏦', ok: true, t: `Откладываешь ~${Math.round(rate * 100)}% дохода`, d: rate >= 0.2 ? 'Это уровень правила 50/30/20 — отлично! Направь излишек на подушку безопасности (3–6 месяцев расходов).' : 'Неплохо! Цель — 20% по правилу 50/30/20.'});
    }

    const recent = money.filter(x => x.day.startsWith(month)).sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id)
      .map(x => Object.assign({}, x, {ic: catInfo(x.cat).ic, catName: catInfo(x.cat).n}));
    return {
      currency: cur, month: MONTHS[mo - 1], monthIn: MONTHS_IN[mo - 1], budget, income: cfg.income, incomeLogged,
      spent, todaySpent, perDayAvg, projection, left, perDayLeft, daysLeft: daysIn - dayNo + 1,
      cats, tips, recent, categories: CATS.map(c => ({k: c.k, n: c.n, ic: c.ic})),
    };
  }
  function dailySpent(DB, day) { return (DB.money || []).filter(x => x.type === 'exp' && x.day === day).reduce((s, x) => s + x.amount, 0) }

  window.Money = {parse, category, catInfo, state, dailySpent, CATS};
})();
