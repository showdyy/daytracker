// Трекер дня — вся логика приложения на телефоне: хранилище, разбор записей, справочник калорий, нормы.
// Повторяет поведение Python-бота (parsers.py, foods.py, norms.py, webapp.py), но работает без сервера.
(function () {
  'use strict';
  const DAY_START_HOUR = 4;
  const KEY = 'daytracker.v1';
  const W = '[0-9A-Za-zА-Яа-яЁё_]';
  const NUM = '(\\d+(?:[.,]\\d+)?)';
  const X = '\\s*[xхXХ×*]\\s*';
  const fl = s => parseFloat(String(s).replace(',', '.'));
  const cut = (s, m) => s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
  const r1 = x => x == null ? null : Math.round(x * 10) / 10;
  const n2 = x => { if (x == null) return null; const v = Math.round(x * 100) / 100; return v };
  const cleanName = s => { s = s.replace(/\s+/g, ' ').replace(/^[\s,.;:\-—–+]+|[\s,.;:\-—–+]+$/g, ''); return s ? s[0].toUpperCase() + s.slice(1) : s };

  /* ============================================================ даты */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const pDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) };
  const addDays = (s, n) => { const d = pDate(s); d.setDate(d.getDate() + n); return iso(d) };
  const today = () => iso(new Date(Date.now() - DAY_START_HOUR * 3600e3));
  const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  /* ============================================================ хранилище */
  const fresh = () => ({
    v: 1, seq: 1,
    goals: {kcal: 2200, protein: 120, fat: 70, carbs: 250, water: 2000, sleep: 8},
    profile: {sex: null, age: null, height: null, activity: 1.375, goal: 'keep'},
    food: [], workout: [], water: [], tasks: [], habits: [],
    sleep: {}, weight: {}, mood: {}, habitLog: {},
    money: [], moneyCfg: {budget: null, income: null, currency: '₸'},
  });
  let DB;
  try { DB = JSON.parse(localStorage.getItem(KEY)) || fresh() } catch (e) { DB = fresh() }
  DB = Object.assign(fresh(), DB);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)) } catch (e) { console.warn('save failed', e) } };
  const nid = () => DB.seq++;

  /* ============================================================ разбор упражнений */
  const RE_SRW = new RegExp(`(\\d+)${X}(\\d+)(?:${X}${NUM})?(?:\\s*(?:кг|kg))?`, 'i');
  const RE_KG = new RegExp(`${NUM}\\s*(?:кг|kg)(?!${W})`, 'i');
  const RE_KM = new RegExp(`${NUM}\\s*(?:км|km)(?!${W})`, 'i');
  const RE_HOUR = new RegExp(`${NUM}\\s*(?:часов|часа|час|ч|h)(?!${W})`, 'i');
  const RE_MIN = new RegExp(`${NUM}\\s*(?:минут[аы]?|мин|min|m)(?!${W})`, 'i');
  const RE_SEC = new RegExp(`${NUM}\\s*(?:секунд[аы]?|сек|sec|s)(?!${W})`, 'i');
  const RE_REPS = new RegExp(`(?<![0-9A-Za-zА-Яа-яЁё_.,])(\\d+)\\s*(?:раза|раз|повт${W}*|reps?)?(?![0-9A-Za-zА-Яа-яЁё_.,])`, 'i');

  function parseExercise(text) {
    let s = ' ' + text.trim() + ' ';
    if (!s.trim()) return null;
    let sets = null, reps = null, weight = null, minutes = null, km = null, m;
    if ((m = RE_SRW.exec(s))) { sets = +m[1]; reps = +m[2]; weight = m[3] ? fl(m[3]) : null; s = cut(s, m) }
    if (weight == null && (m = RE_KG.exec(s))) { weight = fl(m[1]); s = cut(s, m) }
    if ((m = RE_KM.exec(s))) { km = fl(m[1]); s = cut(s, m) }
    for (const [rx, k] of [[RE_HOUR, 60], [RE_MIN, 1], [RE_SEC, 1 / 60]]) {
      if ((m = rx.exec(s))) { minutes = (minutes || 0) + fl(m[1]) * k; s = cut(s, m) }
    }
    if (reps == null && minutes == null && km == null && (m = RE_REPS.exec(s))) { reps = +m[1]; sets = 1; s = cut(s, m) }
    const name = cleanName(s);
    if (!name) return null;
    return {name, sets, reps, weight: r1(weight), minutes: minutes ? n2(minutes) : null, km: r1(km)};
  }
  function exerciseDetail(r) {
    const parts = [];
    const n = x => String(r1(x)).replace('.', ',');
    if (r.sets && r.reps) { let s = r.sets > 1 ? `${r.sets}×${r.reps}` : `${r.reps} повт.`; if (r.weight) s += ` × ${n(r.weight)} кг`; parts.push(s) }
    else if (r.weight) parts.push(`${n(r.weight)} кг`);
    if (r.km) parts.push(`${n(r.km)} км`);
    if (r.minutes) parts.push(r.minutes >= 1 ? `${n(r.minutes)} мин` : `${Math.round(r.minutes * 60)} сек`);
    return parts.join(', ');
  }

  /* ============================================================ еда: свои цифры */
  const MACRO = {
    protein: 'белок|белки|белка|prot|б|p',
    fat: 'жиры|жира|жир|fat|ж|f',
    carbs: 'углеводы|углев|угл|carbs|carb|у|c',
  };
  const NOTW = '(?<![0-9A-Za-zА-Яа-яЁё_.,])';
  const RE_MACRO_PRE = {}, RE_MACRO_POST = {};
  for (const [k, v] of Object.entries(MACRO)) {
    RE_MACRO_PRE[k] = new RegExp(`(?<!${W})(?:${v})\\s*[:=]?\\s*${NUM}(?!${W})`, 'i');
    RE_MACRO_POST[k] = new RegExp(`${NOTW}${NUM}(?:${v})(?!${W})`, 'i');
  }
  const RE_BJU = new RegExp(`(?:кбжу|бжу|к/б/ж/у|б/ж/у)?\\s*[:=]?\\s*${NUM}\\s*/\\s*${NUM}\\s*/\\s*${NUM}(?:\\s*/\\s*${NUM})?`, 'i');
  const RE_KCAL_POST = new RegExp(`${NUM}\\s*(?:ккал|kcal|кал|cal|к)(?!${W})`, 'i');
  const RE_KCAL_PRE = new RegExp(`(?<!${W})(?:ккал|kcal)\\s*[:=]?\\s*${NUM}(?!${W})`, 'i');
  const RE_QTY = new RegExp(`${NUM}\\s*(?:граммов|грамм|гр|г|g|мл|ml|л|l|шт${W}*|%|кусо?к${W}*|ломт${W}*|ложк${W}*|порци${W}*)(?!${W})`, 'gi');
  const RE_BARE = new RegExp(`(?<![0-9A-Za-zА-Яа-яЁё_.,/])${NUM}(?![0-9A-Za-zА-Яа-яЁё_.,/%])`, 'g');

  function hasExplicit(text) {
    const s = ' ' + text + ' ';
    return RE_BJU.test(s) || RE_KCAL_POST.test(s) || RE_KCAL_PRE.test(s) ||
      Object.keys(MACRO).some(k => RE_MACRO_PRE[k].test(s) || RE_MACRO_POST[k].test(s));
  }
  function parseFoodExplicit(text) {
    let s = ' ' + text.trim() + ' ', kcal = null, m;
    const mac = {protein: null, fat: null, carbs: null};
    if ((m = RE_BJU.exec(s))) {
      if (m[4]) { kcal = fl(m[1]); mac.protein = fl(m[2]); mac.fat = fl(m[3]); mac.carbs = fl(m[4]) }
      else { mac.protein = fl(m[1]); mac.fat = fl(m[2]); mac.carbs = fl(m[3]) }
      s = cut(s, m);
    }
    if (kcal == null && ((m = RE_KCAL_POST.exec(s)) || (m = RE_KCAL_PRE.exec(s)))) { kcal = fl(m[1]); s = cut(s, m) }
    for (const k of Object.keys(mac)) {
      if (mac[k] != null) continue;
      if ((m = RE_MACRO_PRE[k].exec(s) || RE_MACRO_POST[k].exec(s))) { mac[k] = fl(m[1]); s = cut(s, m) }
    }
    if (kcal == null) {
      const masked = s.replace(RE_QTY, x => ' '.repeat(x.length));
      const found = [...masked.matchAll(RE_BARE)];
      if (found.length) { const mm = found[found.length - 1]; kcal = fl(mm[1]); s = s.slice(0, mm.index) + ' ' + s.slice(mm.index + mm[0].length) }
    }
    if (kcal == null && Object.values(mac).some(v => v != null)) kcal = 4 * (mac.protein || 0) + 9 * (mac.fat || 0) + 4 * (mac.carbs || 0);
    return {name: cleanName(s) || 'Еда', kcal: kcal == null ? null : Math.round(kcal), protein: r1(mac.protein), fat: r1(mac.fat), carbs: r1(mac.carbs)};
  }

  /* ============================================================ еда: справочник */
  const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ALIASES = [];
  for (const food of (window.FOODS || [])) for (const a of food.a) ALIASES.push({rx: new RegExp('(?<![а-яa-z])' + esc(a.replace(/ё/g, 'е'))), a, food});
  ALIASES.sort((x, y) => y.a.length - x.a.length);
  const WORD_NUM = {'один': 1, 'одна': 1, 'одно': 1, 'одну': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'полтора': 1.5, 'полторы': 1.5, 'пара': 2, 'пару': 2};
  const UNIT_G = [
    ['столов[а-я]* ложк[а-я]*|ст\\.? ?л\\.?', 15], ['чайн[а-я]* ложк[а-я]*|ч\\.? ?л\\.?', 5], ['ложк[а-я]*', 15],
    ['стакан[а-я]*|кружк[а-я]*|чашк[а-я]*', 250], ['горст[а-я]*', 30], ['банк[а-я]*', 330],
    ['тарелк[а-я]*|миск[а-я]*|порци[а-я]*', 'portion'], ['кус[а-я]*|ломт[а-я]*|долек|дольк[а-я]*', 'piece'],
  ];
  const RE_MASS = /(\d+(?:[.,]\d+)?)\s*(кг|килограмм[а-я]*|г|гр|грамм[а-я]*|g|мл|ml|литр[а-я]*|л|l)(?![а-яa-z])/;
  const RE_NUM = /(?<![\d.,])(\d+(?:[.,]\d+)?)(?![\d.,])\s*(?:шт[а-я]*)?/;

  function findFood(text) {
    const t = norm(text);
    for (const x of ALIASES) { const m = x.rx.exec(t); if (m) return {food: x.food, alias: x.a, pos: m.index} }
    return null;
  }
  function estimatePart(text) {
    let t = norm(text);
    const hit = findFood(t);
    if (!hit) return null;
    const {food, alias, pos} = hit;
    t = t.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ');
    let grams = null, mult = 1, m;
    if ((m = RE_MASS.exec(t))) {
      const v = fl(m[1]), u = m[2];
      grams = (/^(кг|килограмм|л|литр)/.test(u) || u === 'l') ? v * 1000 : v;
    } else {
      let count = null;
      if (/(?<![а-я])(пол|половин[а-я]*)(?![а-я])|(?<![а-я])пол(?=[а-я]{3,})/.test(t) && !/полтор/.test(t)) mult = 0.5;
      for (const [w, n] of Object.entries(WORD_NUM)) if (new RegExp(`(?<![а-я])${w}(?![а-я])`).test(t)) { count = n; break }
      if ((m = RE_NUM.exec(t))) count = fl(m[1]);
      let unit = null;
      for (const [rx, val] of UNIT_G) if (new RegExp(`(?<![а-я])(?:${rx})`).test(t)) { unit = val; break }
      if (unit === 'portion') grams = food.portion * (count || 1) * mult;
      else if (unit === 'piece') grams = (food.piece || 30) * (count || 1) * mult;
      else if (unit != null) { if (unit === 15 && food.piece && food.piece <= 10) unit = food.piece; grams = unit * (count || 1) * mult }
      else if (count != null && count >= 15) grams = (count <= food.portion * 3 || food.k === 0) ? count : count / food.k * 100;
      else if (count != null) grams = (food.piece || food.portion) * count * mult;
      else grams = (food.piece && food.piece >= food.portion * 0.6 ? food.piece : food.portion) * mult;
    }
    const k = grams / 100;
    let end = pos + alias.length;
    while (end < t.length && /[а-яa-z]/.test(t[end])) end++;
    return {grams: Math.round(grams), kcal: food.k * k, protein: food.p * k, fat: food.f * k, carbs: food.c * k, label: t.slice(pos, end)};
  }
  function estimateLine(line) {
    const total = {kcal: 0, protein: 0, fat: 0, carbs: 0}, detail = [], unknown = [];
    const parts = line.split(/\s*(?:(?<!\d),|,(?!\d)|[;+]|\s+и\s+|\s+плюс\s+)\s*/).map(x => x.trim()).filter(Boolean);
    for (const part of parts) {
      let pieces = [part];
      const hit = findFood(part);
      if (/(?<![а-я])со? (?=[а-я])/.test(norm(part)) && !(hit && hit.alias.includes(' с'))) pieces = part.split(/(?<![а-яА-ЯёЁ])[сС][оО]? (?=[а-яА-ЯёЁ])/).filter(p => p.trim());
      for (const piece of pieces) {
        const est = estimatePart(piece);
        if (!est) { unknown.push(piece.trim()); continue }
        for (const key of Object.keys(total)) total[key] += est[key];
        detail.push(`${est.label} ${est.grams} г`);
      }
    }
    return {ok: !unknown.length && detail.length > 0, kcal: Math.round(total.kcal), protein: r1(total.protein), fat: r1(total.fat), carbs: r1(total.carbs), detail: detail.join(' + '), unknown};
  }
  function parseFood(text) {
    if (!(text || '').trim()) return null;
    if (hasExplicit(text)) return Object.assign(parseFoodExplicit(text), {source: 'user', detail: null, unknown: []});
    const est = estimateLine(text);
    const name = cleanName(text.trim()) || 'Еда';
    if (est.ok) return {name, kcal: est.kcal, protein: est.protein, fat: est.fat, carbs: est.carbs, source: 'db', detail: est.detail, unknown: []};
    if (!est.detail) { const old = parseFoodExplicit(text); if (old.kcal != null) return Object.assign(old, {source: 'user', detail: null, unknown: []}) }
    return {name, kcal: null, protein: null, fat: null, carbs: null, source: null, detail: est.detail || null, unknown: est.unknown};
  }

  /* ============================================================ сон, числа */
  function parseFloatIn(text) { const m = /(\d+(?:[.,]\d+)?)/.exec(text || ''); return m ? fl(m[1]) : null }
  function parseSleep(text) {
    const t = String(text || '').trim().toLowerCase();
    let h = null, m;
    if ((m = /(\d{1,2})[:.](\d{2})\s*(?:-|–|—|до|\s)\s*(\d{1,2})[:.](\d{2})/.exec(t))) {
      const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4]; h = (((b - a) % 1440) + 1440) % 1440 / 60;
    } else if ((m = /(\d{1,2})\s*(?:часов|часа|час|ч|h)\s*(?:(\d{1,2})\s*(?:минут[а-я]*|мин|м|m)?)?/i.exec(t))) {
      h = +m[1] + (m[2] ? +m[2] : 0) / 60;
    } else h = parseFloatIn(t);
    if (h == null || !(h > 0 && h <= 24)) return null;
    return Math.round(h * 100) / 100;
  }
  function waterMl(text) {
    const v = parseFloatIn(String(text));
    if (v == null || v <= 0) return null;
    const ml = v <= 5 ? Math.round(v * 1000) : Math.round(v);
    return ml <= 5000 ? ml : null;
  }

  /* ============================================================ нормы */
  const ACTIVITY = [
    {v: 1.2, n: 'Почти не двигаюсь', d: 'сидячая работа, без тренировок'},
    {v: 1.375, n: 'Лёгкая активность', d: '1–3 тренировки в неделю'},
    {v: 1.55, n: 'Средняя', d: '3–5 тренировок в неделю'},
    {v: 1.725, n: 'Высокая', d: '6–7 тренировок в неделю'},
    {v: 1.9, n: 'Очень высокая', d: 'спорт дважды в день или тяжёлая работа'},
  ];
  const GOALS = {lose: {name: 'Похудеть', kcal: -0.15, protein: 2.0}, keep: {name: 'Держать вес', kcal: 0, protein: 1.6}, gain: {name: 'Набрать массу', kcal: 0.10, protein: 1.8}};
  function computeNorms(sex, age, height, weight, activity, goal) {
    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'm' ? 5 : -161);
    const tdee = bmr * activity, g = GOALS[goal] || GOALS.keep;
    let kcal = Math.max(tdee * (1 + g.kcal), sex === 'm' ? 1500 : 1200);
    kcal = Math.round(kcal / 10) * 10;
    const protein = Math.round(weight * g.protein);
    const fat = Math.round(Math.max(weight * 0.9, kcal * 0.25 / 9));
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const water = Math.round((weight * 33 + (activity >= 1.55 ? 500 : 0)) / 50) * 50;
    return {kcal, protein, fat, carbs, water, bmr: Math.round(bmr), tdee: Math.round(tdee), goal_pct: Math.round(g.kcal * 100)};
  }

  /* ============================================================ выборки */
  const byDay = (arr, d) => arr.filter(x => x.day === d);
  const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
  const activeHabits = () => DB.habits.filter(h => h.active !== false);
  const habitDone = (hid, d) => !!(DB.habitLog[hid] && DB.habitLog[hid][d]);
  function streak(hid, d) {
    let cur = habitDone(hid, d) ? d : addDays(d, -1), s = 0;
    while (habitDone(hid, cur)) { s++; cur = addDays(cur, -1) }
    return s;
  }
  function lastWeight(before) {
    const days = Object.keys(DB.weight).filter(x => x < before).sort();
    return days.length ? {kg: DB.weight[days[days.length - 1]], day: days[days.length - 1]} : {kg: null, day: null};
  }
  function profileState() {
    const p = DB.profile, kg = lastWeight(addDays(today(), 1)).kg;
    const out = {sex: p.sex, age: p.age, height: p.height, weight: kg, activity: p.activity || 1.375, goal: p.goal || 'keep',
      activities: ACTIVITY, goals: Object.entries(GOALS).map(([v, g]) => ({v, n: g.name}))};
    if (p.sex && p.age && p.height && kg) out.norm = computeNorms(p.sex, p.age, p.height, kg, out.activity, out.goal);
    return out;
  }
  function buildState(d) {
    const food = byDay(DB.food, d), water = byDay(DB.water, d), wo = byDay(DB.workout, d), habits = activeHabits();
    const kg = DB.weight[d] ?? null, prev = lastWeight(d).kg;
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const wd = addDays(d, -i), f = byDay(DB.food, wd), t = byDay(DB.tasks, wd);
      week.push({day: wd, wd: WD_SHORT[pDate(wd).getDay()], num: pDate(wd).getDate(),
        kcal: f.length ? Math.round(sum(f, 'kcal')) : null, water: sum(byDay(DB.water, wd), 'ml') || null,
        sleep: DB.sleep[wd] ?? null, trained: byDay(DB.workout, wd).length > 0,
        tasksDone: t.filter(x => x.done).length, tasksTotal: t.length,
        habitsDone: habits.filter(h => habitDone(h.id, wd)).length, habitsTotal: habits.length,
        mood: DB.mood[wd]?.score ?? null, weight: DB.weight[wd] ?? null,
        spent: window.Money ? Money.dailySpent(DB, wd) || null : null});
    }
    const hist = Object.keys(DB.weight).sort().slice(-60).map(day => ({day, kg: DB.weight[day]}));
    return {
      day: d, today: today(), now: nowHM(), dayStartHour: DAY_START_HOUR,
      goals: Object.assign({remind: null}, DB.goals), profile: profileState(), ai: false,
      food: {items: food, kcal: Math.round(sum(food, 'kcal')), protein: r1(sum(food, 'protein')), fat: r1(sum(food, 'fat')), carbs: r1(sum(food, 'carbs'))},
      water: {items: water, total: sum(water, 'ml')},
      workout: {items: wo.map(r => ({id: r.id, ts: r.ts, name: r.name, detail: exerciseDetail(r)})),
        volume: Math.round(wo.reduce((a, r) => a + (r.sets || 1) * (r.reps || 0) * (r.weight || 0), 0)),
        sets: sum(wo, 'sets'), minutes: n2(sum(wo, 'minutes')), km: r1(sum(wo, 'km'))},
      sleep: DB.sleep[d] ?? null,
      weight: {kg, delta: kg != null && prev != null ? r1(kg - prev) : null, history: hist},
      mood: DB.mood[d] || null,
      tasks: byDay(DB.tasks, d).sort((a, b) => a.done - b.done || a.id - b.id).map(t => ({id: t.id, text: t.text, done: !!t.done})),
      habits: habits.map(h => ({id: h.id, name: h.name, slot: h.slot, done: habitDone(h.id, d), streak: streak(h.id, d)})),
      carry: d === today() ? byDay(DB.tasks, addDays(d, -1)).filter(t => !t.done).length : 0,
      week,
      weekHabits: habits.map(h => ({id: h.id, name: h.name, slot: h.slot, days: week.map(w => habitDone(h.id, w.day))})),
      money: window.Money ? Money.state(DB, today()) : null,
    };
  }

  /* ============================================================ «API» */
  const TEMPLATE = {
    morning: ['Стакан воды после пробуждения', 'Заправить кровать', 'Зарядка 10 минут', 'Душ и уход', 'Завтрак с белком'],
    day: ['Прогулка 20 минут', 'Обед без телефона', 'Перерыв от экрана'],
    evening: ['Собрать вещи на завтра', 'Уход перед сном', 'Без телефона за час до сна', 'Чтение 15 минут', 'Записать 3 хороших момента'],
  };
  class ApiError extends Error {}
  const fail = msg => { throw new ApiError(msg) };
  const lines = text => String(text || '').slice(0, 2000).split('\n').filter(x => x.trim());

  function preview(b) {
    const out = [], text = String(b.text || '');
    if (b.type === 'food') for (const line of lines(text)) {
      const r = parseFood(line);
      if (!r) continue;
      if (r.kcal == null) { out.push({name: r.name, value: 'не знаю 🤔', sub: 'допиши калории: «… 300 ккал»', ok: false}); continue }
      out.push({name: r.name, value: (r.source === 'db' ? '≈ ' : '') + `${r.kcal} ккал`,
        sub: [['Б', r.protein], ['Ж', r.fat], ['У', r.carbs]].filter(x => x[1] != null).map(x => x[0] + x[1]).join(' '), detail: r.detail || '', ok: true});
    }
    else if (b.type === 'workout') for (const line of lines(text)) { const r = parseExercise(line); if (r) out.push({name: r.name, value: exerciseDetail(r) || '—', sub: '', ok: true}) }
    else if (b.type === 'water') { const ml = waterMl(text); if (ml) out.push({name: 'Вода', value: `${ml} мл`, sub: '', ok: true}) }
    else if (b.type === 'sleep') { const h = parseSleep(text); if (h) out.push({name: 'Сон', value: `${h} ч`, sub: '', ok: true}) }
    else if (b.type === 'weight') { const kg = parseFloatIn(text); if (kg && kg >= 20 && kg <= 400) out.push({name: 'Вес', value: `${kg} кг`, sub: '', ok: true}) }
    else if (b.type === 'money' && window.Money) for (const line of lines(text)) {
      const r = Money.parse(line), cur = (DB.moneyCfg || {}).currency || '₸';
      if (!r) { out.push({name: line.trim(), value: 'нет суммы', sub: 'напиши число: «кофе 250»', ok: false}); continue }
      const c = Money.catInfo(r.cat);
      out.push({name: `${c.ic} ${r.note}`, value: `${r.type === 'inc' ? '+' : '−'}${Math.round(r.amount).toLocaleString('ru-RU').replace(/ /g, ' ')} ${cur}`, sub: '', detail: c.n, ok: true});
    }
    return {items: out};
  }

  function add(b) {
    const d = today(), ts = nowHM(), text = String(b.text || '');
    let added = 0;
    if (b.type === 'food') {
      const unknown = [];
      for (const line of lines(text)) {
        const r = parseFood(line);
        if (!r) continue;
        if (r.kcal == null) { unknown.push(r.name); continue }
        DB.food.push({id: nid(), day: d, ts, name: r.name, kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, source: r.source, detail: r.detail});
        added++;
      }
      if (unknown.length && !added) fail(`Не знаю «${unknown[0]}» — допиши калории, например: ${unknown[0]} 300 ккал`);
    } else if (b.type === 'workout') {
      for (const line of lines(text)) { const r = parseExercise(line); if (r) { DB.workout.push(Object.assign({id: nid(), day: d, ts}, r)); added++ } }
    } else if (b.type === 'water') {
      const ml = waterMl(b.ml ?? text); if (ml) { DB.water.push({id: nid(), day: d, ts, ml}); added = 1 }
    } else if (b.type === 'sleep') {
      const h = parseSleep(String(b.hours ?? text)); if (h) { DB.sleep[d] = h; added = 1 }
    } else if (b.type === 'weight') {
      const kg = parseFloatIn(text); if (kg && kg >= 20 && kg <= 400) { DB.weight[d] = kg; added = 1 }
    } else if (b.type === 'mood') {
      const s = +b.score; if (s >= 1 && s <= 5) { DB.mood[d] = Object.assign({}, DB.mood[d], {score: s}); added = 1 }
    } else if (b.type === 'task') {
      for (const line of lines(text)) { DB.tasks.push({id: nid(), day: d, text: line.trim().slice(0, 200), done: false}); added++ }
    } else if (b.type === 'money' && window.Money) {
      DB.money = DB.money || [];
      for (const line of lines(text)) {
        const r = Money.parse(line);
        if (r) { DB.money.push(Object.assign({id: nid(), day: d, ts}, r)); added++ }
      }
      if (!added) fail('Не нашёл сумму 🤔 Пример: кофе 250');
    } else if (b.type === 'habit') {
      const slot = ['morning', 'day', 'evening'].includes(b.slot) ? b.slot : 'morning';
      for (const line of lines(text)) { DB.habits.push({id: nid(), name: line.trim().slice(0, 100), slot, active: true}); added++ }
    }
    if (!added) fail('Не понял запись 🤔');
    save();
  }

  function request(path, body) {
    const [route, qs] = path.split('?');
    const q = new URLSearchParams(qs || '');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') || '') ? q.get('day') : today();
    const b = body || {};
    switch (route) {
      case '/api/state': return buildState(day);
      case '/api/preview': return preview(b);
      case '/api/add': add(b); return buildState(today());
      case '/api/toggle': {
        if (b.kind === 'task') { const t = DB.tasks.find(x => x.id === +b.id); if (t) t.done = !t.done }
        else if (b.kind === 'habit') { const d = today(), log = DB.habitLog[b.id] = DB.habitLog[b.id] || {}; if (log[d]) delete log[d]; else log[d] = true }
        save(); return buildState(today());
      }
      case '/api/delete': {
        const id = +b.id;
        if (['food', 'workout', 'water', 'tasks', 'task', 'money'].includes(b.kind)) { const k = b.kind === 'task' ? 'tasks' : b.kind; DB[k] = DB[k].filter(x => x.id !== id) }
        else if (b.kind === 'habit') { const h = DB.habits.find(x => x.id === id); if (h) h.active = false }
        save(); return buildState(day);
      }
      case '/api/money-cfg': {
        const cfg = DB.moneyCfg = Object.assign({budget: null, income: null, currency: '₸'}, DB.moneyCfg);
        if ('currency' in b && ['₸', '₽', '$', '€', '₴', 'сом'].includes(b.currency)) cfg.currency = b.currency;
        for (const k of ['budget', 'income']) if (k in b) {
          const raw = String(b[k] ?? '').replace(/[\s  ]/g, '');
          if (!raw) cfg[k] = null;
          else { const v = parseFloat(raw.replace(',', '.')); if (!(v >= 0 && v < 1e10)) fail('Нужно число'); cfg[k] = Math.round(v) || null }
        }
        save(); return buildState(today());
      }
      case '/api/money-cat': {
        const x = (DB.money || []).find(m => m.id === +b.id);
        if (x && x.type === 'exp' && window.Money?.CATS.some(c => c.k === b.cat)) x.cat = b.cat;
        save(); return buildState(day);
      }
      case '/api/carry': {
        const y = addDays(today(), -1);
        DB.tasks.forEach(t => { if (t.day === y && !t.done) t.day = today() });
        save(); return buildState(today());
      }
      case '/api/template': {
        const have = new Set(activeHabits().map(h => h.slot));
        for (const [slot, items] of Object.entries(TEMPLATE)) if (!have.has(slot)) for (const name of items) DB.habits.push({id: nid(), name, slot, active: true});
        save(); return buildState(today());
      }
      case '/api/goal': {
        const lim = {kcal_goal: [800, 6000, 'kcal'], protein_goal: [10, 400, 'protein'], fat_goal: [10, 300, 'fat'], carbs_goal: [0, 900, 'carbs'], water_goal: [500, 6000, 'water'], sleep_goal: [4, 12, 'sleep']}[b.field];
        if (!lim) fail('Неизвестное поле');
        const v = parseFloatIn(String(b.value));
        if (v == null || v < lim[0] || v > lim[1]) fail(`Нужно число от ${lim[0]} до ${lim[1]}`);
        DB.goals[lim[2]] = lim[2] === 'sleep' ? v : Math.round(v);
        save(); return buildState(today());
      }
      case '/api/profile': {
        const sex = ['m', 'f'].includes(b.sex) ? b.sex : null, age = parseInt(b.age), height = fl(b.height), weight = fl(b.weight);
        const activity = fl(b.activity || 1.375), goal = GOALS[b.goal] ? b.goal : 'keep';
        if (!sex || !(age >= 12 && age <= 100) || !(height >= 120 && height <= 230) || !(weight >= 30 && weight <= 300)) fail('Проверь значения: пол, возраст 12–100, рост 120–230 см, вес 30–300 кг');
        Object.assign(DB.profile, {sex, age, height, activity, goal});
        if (lastWeight(addDays(today(), 1)).kg !== weight) DB.weight[today()] = weight;
        const n = computeNorms(sex, age, height, weight, activity, goal);
        Object.assign(DB.goals, {kcal: n.kcal, protein: n.protein, fat: n.fat, carbs: n.carbs, water: n.water});
        save(); return buildState(today());
      }
    }
    fail('Неизвестный запрос');
  }

  /* ============================================================ резервная копия */
  function exportJSON() { return JSON.stringify(Object.assign({app: 'daytracker', exported: new Date().toISOString()}, DB), null, 1) }
  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.food) || !data.goals) throw new Error('Это не файл резервной копии трекера');
    DB = Object.assign(fresh(), data);
    delete DB.app; delete DB.exported;
    const maxId = Math.max(0, ...['food', 'workout', 'water', 'tasks', 'habits', 'money'].flatMap(k => (DB[k] || []).map(x => x.id || 0)));
    DB.seq = Math.max(DB.seq || 1, maxId + 1);
    save();
  }

  window.Core = {request, ApiError, exportJSON, importJSON, parseFood, parseExercise, parseSleep, computeNorms, today};
})();
