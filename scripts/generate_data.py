# Условный сад для примера результата предпроекта по саду.
# Все данные синтетические. Модель потенциала - смешанная модель на лог-шкале:
# log(y_qt) - log f(age_qt) = alpha_variety + gamma_year + u_quarter + e
import json, math, os
import numpy as np
import pandas as pd
from scipy.stats import norm
import statsmodels.formula.api as smf

rng = np.random.default_rng(20261009)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(OUT, exist_ok=True)

YEARS = [2021, 2022, 2023, 2024, 2025, 2026]
YEAR_F = {2021: 1.02, 2022: 1.08, 2023: 0.93, 2024: 0.45, 2025: 1.20, 2026: 0.98}
PRICE = 65  # руб/кг, условно

# сорт: (зрелый потенциал при хорошей технологии, т/га; склонность к периодичности; подвой; схема; густота)
VAR = {
    "Гала":            dict(B=38, bien=0.25, poll=0.0),
    "Голден Делишес":  dict(B=36, bien=0.55, poll=0.0),
    "Айдаред":         dict(B=36, bien=0.45, poll=0.0),
    "Глостер":         dict(B=31, bien=0.35, poll=0.0),
    "Ред Чиф":         dict(B=31, bien=0.30, poll=0.05),
    "Лигол":           dict(B=34, bien=0.40, poll=0.0),
    "Флорина":         dict(B=30, bien=0.25, poll=0.0),
    "Хоникрисп":       dict(B=27, bien=0.70, poll=0.08),
    "Ренет Симиренко": dict(B=29, bien=0.50, poll=0.05),
    "Cosmic Crisp":    dict(B=38, bien=0.35, poll=0.15),
    "Антоновка":       dict(B=15, bien=0.60, poll=0.0),
    "Синап Орловский": dict(B=14, bien=0.50, poll=0.0),
}
INTENSIVE = dict(rootstock="M9", scheme="3,5 x 1,0 м", trees=2857)
SECTIONS = [
    # id, имя, почва, рельеф/микрозона, орошение, состав (сорт, годы посадки), площадь, ряд карты
    dict(id=1, name="Участок 1. Северное плато", soil="Чернозем", zone="Плато", irr="Капельное, фертигация",
         mix=[("Айдаред", 2011, 2013), ("Голден Делишес", 2011, 2014), ("Глостер", 2012, 2013), ("Ред Чиф", 2013, 2015), ("Гала", 2013, 2014)], ha=200),
    dict(id=2, name="Участок 2. Центральный", soil="Суглинок", zone="Плато", irr="Капельное, фертигация",
         mix=[("Гала", 2014, 2016), ("Лигол", 2014, 2016), ("Флорина", 2013, 2014), ("Хоникрисп", 2015, 2016)], ha=220),
    dict(id=3, name="Участок 3. Балка", soil="Глина, суглинок", zone="Низина, сток холодного воздуха", irr="Капельное",
         mix=[("Гала", 2014, 2016), ("Хоникрисп", 2015, 2017), ("Голден Делишес", 2014, 2015)], ha=150),
    dict(id=4, name="Участок 4. Южный склон", soil="Песок, супесь", zone="Склон, водный дефицит", irr="Капельное",
         mix=[("Гала", 2015, 2017), ("Ренет Симиренко", 2015, 2016), ("Лигол", 2016, 2017)], ha=130),
    dict(id=5, name="Участок 5. Молодой сад", soil="Чернозем, суглинок", zone="Плато", irr="Капельное, фертигация",
         mix=[("Cosmic Crisp", 2019, 2021), ("Гала", 2019, 2019)], ha=130),
    dict(id=6, name="Участок 6. Старый сад", soil="Чернозем", zone="Плато", irr="Без орошения",
         mix=[("Антоновка", 1979, 1984), ("Синап Орловский", 1982, 1988)], ha=170),
]

def fm(x):
    return f"{x:.1f}".replace(".", ",")

def ramp(variety, age):
    if variety in ("Антоновка", "Синап Орловский"):
        return max(0.45, 1 - max(0, age - 28) * 0.02)
    return float(min(1.0, max(0.05, (age - 1) / 5.0)))

rows = []
for s in SECTIONS:
    left = s["ha"]
    k = 0
    while left > 2.5:
        a = float(np.clip(rng.gamma(6, 1.5), 3, 15))
        if left - a < 3: a = left
        a = round(a, 1)
        left -= a
        k += 1
        var, y0, y1 = s["mix"][rng.integers(len(s["mix"]))]
        if s["id"] == 5 and k <= 2: var, y0, y1 = "Гала", 2019, 2019
        py = int(rng.integers(y0, y1 + 1))
        old = var in ("Антоновка", "Синап Орловский")
        if old:
            root, scheme, plan = "Семенной", "6 x 4 м", 417
        elif var == "Cosmic Crisp":
            root, scheme, plan = "M9", "3,2 x 0,9 м", 3472
        elif s["id"] == 1 and py <= 2012:
            root, scheme, plan = "54-118", "4,0 x 1,5 м", 1667
        else:
            root, scheme, plan = INTENSIVE["rootstock"] if rng.random() < .7 else "62-396", INTENSIVE["scheme"], INTENSIVE["trees"]
        rows.append(dict(section=s["id"], section_name=s["name"], soil=s["soil"], zone=s["zone"], irrigation=s["irr"],
                         id=f"{s['id']}-{k:02d}", variety=var, year_planted=py, rootstock=root, scheme=scheme,
                         trees_plan_ha=plan, area_ha=a, old=old))

q = pd.DataFrame(rows)
n = len(q)

# истинные потери (то, что предстоит найти)
vy = np.where(q.old, rng.uniform(0.18, 0.38, n), rng.beta(2, 22, n))
vy = np.where(q.section == 3, vy + rng.uniform(0.02, 0.07, n), vy)
bien_flag = rng.random(n) < q.variety.map(lambda v: VAR[v]["bien"]).values
bien_loss = np.where(bien_flag, rng.uniform(0.08, 0.16, n), 0.0)
frost_loss = np.where(q.section == 3, rng.uniform(0.08, 0.20, n), 0.0)
irr_loss = np.where(q.section == 4, rng.uniform(0.07, 0.15, n), np.where(q.section == 3, rng.uniform(0.0, 0.05, n), rng.uniform(0, 0.03, n)))
poll_loss = q.variety.map(lambda v: VAR[v]["poll"]).values * rng.uniform(0.6, 1.3, n)
other = rng.uniform(0.02, 0.12, n)
u_true = rng.normal(0, 0.08, n)
q["vypad"] = vy.round(3)
q["trees_fact_ha"] = (q.trees_plan_ha * (1 - q.vypad)).round().astype(int)
q["bien_flag"] = bien_flag
for nm, arr in [("bien_loss", bien_loss), ("frost_loss", frost_loss), ("irr_loss", irr_loss), ("poll_loss", poll_loss), ("other_loss", other)]:
    q[nm] = arr

def true_level(r, year):
    age = year - r.year_planted
    B = VAR[r.variety]["B"] * (0.92 if r.rootstock == "54-118" else 1.0)
    return B * ramp(r.variety, age)

yl = []
for i, r in q.iterrows():
    mult = (1 - r.vypad) * (1 - r.bien_loss) * (1 - r.frost_loss) * (1 - r.irr_loss) * (1 - r.poll_loss) * (1 - r.other_loss) * math.exp(u_true[i])
    for t in YEARS:
        age = t - r.year_planted
        if age < 3: continue
        f = YEAR_F[t]
        if r.section == 3 and t == 2024: f *= 0.55
        if r.section == 4 and t in (2021, 2025): f *= 0.92
        if r.bien_flag:
            f *= {2022: 0.92, 2023: 1.08, 2024: 1.0, 2025: 1.28, 2026: 0.62}.get(t, 1.0)
        y = true_level(r, t) * mult * f * math.exp(rng.normal(0, 0.09))
        yl.append(dict(id=r.id, year=t, t_ha=round(max(0.3, y), 1), ramp=ramp(r.variety, age), variety=r.variety))
Y = pd.DataFrame(yl)

# --- модель потенциала ---
Y["z"] = np.log(Y.t_ha) - np.log(Y.ramp)
md = smf.mixedlm("z ~ 0 + C(variety) + C(year)", Y, groups=Y["id"])
fit = md.fit(reml=True, method=["powell", "lbfgs"])
s2u = float(fit.cov_re.iloc[0, 0]); s2e = float(fit.scale)
fe = fit.fe_params
cov = fit.cov_params()
yrs = [p for p in fe.index if p.startswith("C(year)")]
gam = {2021: 0.0}
for p in yrs: gam[int(p.split("T.")[1].rstrip("]"))] = fe[p]
# "нормальный год" = медиана эффектов лет
g_med = float(np.median(list(gam.values())))
years_out = [dict(year=t, effect_pct=round((math.exp(gam[t] - g_med) - 1) * 100, 1),
                  label={2024: "Майские заморозки"}.get(t, "")) for t in YEARS]

blup = fit.random_effects
lev, lo, hi, p25, nobs = [], [], [], [], []
for i, r in q.iterrows():
    dq = Y[Y.id == r.id]
    nq = len(dq)
    u = float(blup[r.id].iloc[0]) if r.id in blup else 0.0
    vu = s2u * s2e / (nq * s2u + s2e)
    pv = f"C(variety)[{r.variety}]"
    va = float(cov.loc[pv, pv])
    mu = fe[pv] + g_med + u + math.log(ramp(r.variety, 2027 - r.year_planted))
    sd = math.sqrt(vu + va)
    lev.append(math.exp(mu)); lo.append(math.exp(mu - 1.645 * sd)); hi.append(math.exp(mu + 1.645 * sd))
    p25.append(1 - norm.cdf((math.log(25) - mu) / sd)); nobs.append(nq)
q["level_2027"] = np.round(lev, 1); q["ci_low"] = np.round(lo, 1); q["ci_high"] = np.round(hi, 1)
q["p25"] = np.round(p25, 2); q["n_years"] = nobs

avg = Y.groupby("id").t_ha.mean(); last2 = Y[Y.year >= 2025].groupby("id").t_ha.mean()
q["fact_avg"] = q.id.map(avg).round(1); q["fact_2025_26"] = q.id.map(last2).round(1)
q["benchmark_2027"] = [round(true_level(r, 2027) * (1 - 0.04), 1) for _, r in q.iterrows()]  # ориентир сорта и возраста при хорошей технологии, выпад 4%

# --- карта потерь (оценка): ориентир -> уровень квартала ---
CAUSES = [
    ("vypad", "Выпады деревьев", True),
    ("bien", "Перегруз и периодичность", True),
    ("frost", "Заморозки, низина", False),
    ("irr", "Полив", True),
    ("poll", "Опыление", True),
    ("other", "Питание и прочее", True),
]
loss_rows = []
recov = []
field = set()
for i, r in q.iterrows():
    gap = max(0.0, r.benchmark_2027 - r.level_2027)
    raw = dict(vypad=max(0, r.vypad - 0.04), bien=r.bien_loss, frost=r.frost_loss, irr=r.irr_loss, poll=r.poll_loss, other=r.other_loss)
    tot = sum(raw.values()) or 1
    rec = 0.0
    loss_rows.append(dict(id=r.id, step=0, label="Ориентир сорта и возраста", t_ha=r.benchmark_2027, kind="start", status=""))
    st = 1
    vals = {key: round(gap * raw[key] / tot, 1) for key, _, _ in CAUSES}
    vals = {k_: v_ for k_, v_ in vals.items() if v_ >= 0.3}
    if vals:
        diff = round(r.benchmark_2027 - sum(vals.values()) - r.level_2027, 1)
        kmax = max(vals, key=vals.get)
        if gap > 0: vals[kmax] = round(vals[kmax] + diff, 1)
    for key, label, fixable in CAUSES:
        if key not in vals: continue
        v = vals[key]
        if key in ("bien",):
            status = "Подтверждено данными" if r.bien_flag else "Версия, проверить"
        elif key == "vypad":
            status = "Подтверждено реестром"
        elif key == "frost":
            status = "Подтверждено погодой"
        else:
            status = "Версия, проверить"
        # восстановимая часть в первый год программы
        share = dict(vypad=0.3, bien=0.7, irr=0.8, poll=0.4, other=0.5, frost=0.0)[key]
        rec += v * share
        loss_rows.append(dict(id=r.id, step=st, label=label, t_ha=-v, kind="loss", status=status, fixable=fixable))
        st += 1
    loss_rows.append(dict(id=r.id, step=st, label="Уровень квартала, нормальный год", t_ha=r.level_2027, kind="end", status=""))
    recov.append(round(rec, 1))
q["recoverable_2027"] = recov
q["with_program_2027"] = (q.level_2027 + q.recoverable_2027).round(1)

# --- классификация ---
cat, conf, reason, winter, spring = [], [], [], [], []
for i, r in q.iterrows():
    young = (2027 - r.year_planted) < 8
    big = max([("bien", r.bien_loss), ("frost", r.frost_loss), ("irr", r.irr_loss), ("poll", r.poll_loss), ("vypad", r.vypad - 0.04), ("other", r.other_loss)], key=lambda x: x[1])[0]
    if r.old:
        if r.level_2027 < 5.5 or r.vypad > 0.32:
            c = "Кандидат на вывод"; cf = "Высокая"
            rs = f"Возраст {2027 - r.year_planted} лет, выпад {round(r.vypad * 100)}%, {fm(r.level_2027)} т/га"
            w = "Санитарный минимум до решения на следующих этапах (EXIT или REPLANT)"; sp = "Экономика EXIT против REPLANT"
        else:
            c = "Санитарный минимум"; cf = "Высокая"
            rs = f"Старый сад на семенном подвое, {fm(r.level_2027)} т/га"
            w = "Санитарная обрезка, защита от парши и плодожорки по минимуму"; sp = "Не требуется"
    elif r.p25 >= 0.8 and not young:
        c = "Core"; cf = "Высокая" if r.p25 >= 0.9 and r.n_years >= 5 else "Средняя"
        rs = f"Устойчиво {fm(r.level_2027)} т/га с поправкой на погоду"
        w = "Полная программа; обрезка под фактическую закладку почек"; sp = "Нормирование нагрузки по биобюджету"
    elif r.with_program_2027 >= 25 and r.frost_loss < 0.12:
        c = "Усиление"
        if young: cf = "Нужна проверка"
        elif big in ("bien", "vypad") and r.p25 >= 0.3: cf = "Средняя"
        else: cf = "Нужна проверка"
        rs = {"bien": "Перегруз 2025 и провал 2026: нужна нормировка нагрузки",
              "irr": "Недополив на песке в засушливые годы",
              "poll": "Не хватает опылителей, низкая завязь",
              "vypad": f"Выпад {round(r.vypad * 100)}%: подсадка и перерасчет нагрузки",
              "frost": "Заморозки в низине",
              "other": "Питание и прочие технологические потери"}[big]
        if young: rs = "Молодой сад, выход на плодоношение; " + ("опылители" if r.variety == "Cosmic Crisp" else "нагрузка")
        w = {"bien": "Щадящая обрезка, план химического прореживания", "irr": "Полив по датчикам влажности, ревизия капельниц",
             "poll": "Дополнительные опылители и ульи к цветению", "vypad": "Подсадка выпавших мест весной",
             "frost": "Протокол защиты от заморозков", "other": "Листовая диагностика летом"}[big]
        sp = "Цветение и завязь в мае-июне 2027" if cf == "Нужна проверка" else "Контроль завязи и нагрузки"
    else:
        c = "Санитарный минимум"
        cf = "Нужна проверка" if r.p25 >= 0.15 or young else ("Средняя" if r.level_2027 >= 18 else "Высокая")
        rs = {"frost": "Хронические потери от заморозков в низине", "irr": "Водный дефицит на песке",
              }.get(big, f"{fm(r.level_2027)} т/га, с программой не выше {fm(r.with_program_2027)} т/га")
        w = "Санитарный минимум; не вкладываться до проверки" if cf == "Нужна проверка" else "Санитарный минимум"
        sp = "Цветение и завязь в мае-июне 2027" if cf == "Нужна проверка" else "Не требуется"
    cat.append(c); conf.append(cf); reason.append(rs); winter.append(w); spring.append(sp)
q["category"] = cat; q["confidence"] = conf; q["main_reason"] = reason; q["winter_action"] = winter; q["spring_check"] = spring
q["kg_tree"] = (q.level_2027 * 1000 / q.trees_fact_ha).round(1)
q["packout_pct"] = np.where(q.old, rng.uniform(45, 60, n), rng.uniform(68, 86, n)).round(0)

# квартал на выезде: 30 штук, сильные + слабые + серые
cand = q[~q.old].copy()
pick = list(cand[cand.confidence == "Нужна проверка"].sample(min(12, (cand.confidence == "Нужна проверка").sum()), random_state=1).id)
pick += list(cand[cand.category == "Core"].nlargest(6, "area_ha").id)
pick += list(cand[cand.category == "Усиление"].sample(8, random_state=2).id)
pick += list(cand[cand.category == "Санитарный минимум"].sample(4, random_state=3).id)
q["field_visit"] = q.id.isin(set(pick))
for lr in loss_rows:
    if lr["id"] in set(pick) and lr["status"] == "Версия, проверить":
        lr["status"] = "Проверено на выезде" if rng.random() < 0.6 else "Версия, проверить"

# --- сценарии: площадь полной программы 300 / 400 / 500 га ---
order = pd.concat([
    q[q.category == "Core"].sort_values("p25", ascending=False),
    q[(q.category == "Усиление") & (q.confidence != "Нужна проверка")].sort_values("with_program_2027", ascending=False),
    q[(q.category == "Усиление") & (q.confidence == "Нужна проверка")].sort_values("with_program_2027", ascending=False),
    q[(q.category == "Санитарный минимум") & (q.confidence == "Нужна проверка")].sort_values("with_program_2027", ascending=False),
])
scen = []
for S in (300, 400, 500):
    acc, ids = 0.0, []
    for _, r in order.iterrows():
        if acc >= S - 4: break
        ids.append(r.id); acc += r.area_ha
    q[f"in_{S}"] = q.id.isin(ids)
    P = q[q[f"in_{S}"]]; R = q[~q[f"in_{S}"]]
    trees_p = float((P.trees_fact_ha * P.area_ha).sum()); trees_r = float((R.trees_fact_ha * R.area_ha).sum())
    harvest_p = float((np.where(P.category == "Core", P.level_2027, P.with_program_2027) * P.area_ha).sum())
    harvest_r = float((R.level_2027 * 0.8 * R.area_ha).sum())
    for norm_full, norm_san in ((150, 15), (200, 20)):
        cost_p = trees_p * norm_full / 1e6; cost_r = trees_r * norm_san / 1e6
        scen.append(dict(scenario=f"{S} га", target_ha=S, norm=f"{norm_full} руб/дерево", area_ha=round(acc, 1), quarters=len(ids),
                         trees_k=round(trees_p / 1000), cost_program_mln=round(cost_p, 1), cost_sanitary_mln=round(cost_r, 1),
                         cost_total_mln=round(cost_p + cost_r, 1), harvest_program_t=round(harvest_p), harvest_rest_t=round(harvest_r),
                         yield_program_t_ha=round(harvest_p / acc, 1), cost_per_kg_rub=round(cost_p * 1e6 / (harvest_p * 1000), 2),
                         gray_ha=round(float(P[P.confidence == "Нужна проверка"].area_ha.sum()), 1)))
S = pd.DataFrame(scen)

summ = []
for c in ["Core", "Усиление", "Санитарный минимум", "Кандидат на вывод"]:
    d = q[q.category == c]
    summ.append(dict(category=c, area_ha=round(float(d.area_ha.sum()), 1), quarters=int(len(d)),
                     level_avg=round(float((d.level_2027 * d.area_ha).sum() / d.area_ha.sum()), 1),
                     gray_ha=round(float(d[d.confidence == "Нужна проверка"].area_ha.sum()), 1)))
summ.append(dict(category="Всего", area_ha=round(float(q.area_ha.sum()), 1), quarters=int(n),
                 level_avg=round(float((q.level_2027 * q.area_ha).sum() / q.area_ha.sum()), 1),
                 gray_ha=round(float(q[q.confidence == "Нужна проверка"].area_ha.sum()), 1)))
summ_df = pd.DataFrame(summ)

# --- раскладка карты: два ряда участков, площадь на карте пропорциональна га ---
W, H, G, HEAD = 1000.0, 600.0, 14.0, 20.0
rowsets = [[1, 2, 3], [4, 5, 6]]
tot = q.area_ha.sum()
geo = {}; sec_rows = []
ycur = 0.0
for rs in rowsets:
    ha_row = q[q.section.isin(rs)].area_ha.sum()
    h = (H - G) * ha_row / tot
    xcur = 0.0
    for sid in rs:
        d = q[q.section == sid]
        w = (W - G * (len(rs) - 1)) * d.area_ha.sum() / ha_row
        sec_rows.append(dict(section=sid, name=[s for s in SECTIONS if s["id"] == sid][0]["name"], x=round(xcur, 1), y=round(ycur, 1),
                             w=round(w, 1), h=round(h, 1), soil=d.soil.iloc[0], zone=d.zone.iloc[0], ha=round(float(d.area_ha.sum()), 1)))
        # полосы
        inner_y = ycur + HEAD; inner_h = h - HEAD
        ids = list(d.id); areas = list(d.area_ha)
        k = max(1, round(math.sqrt(len(ids) * inner_h / w)))
        per = math.ceil(len(ids) / k)
        strips = [list(range(j, min(j + per, len(ids)))) for j in range(0, len(ids), per)]
        sa = [sum(areas[j] for j in st) for st in strips]
        yy = inner_y
        for st, s_area in zip(strips, sa):
            sh = inner_h * s_area / sum(sa)
            xx = xcur
            for j in st:
                cw = w * areas[j] / s_area
                geo[ids[j]] = (round(xx + 1.5, 1), round(yy + 1.5, 1), round(cw - 3, 1), round(sh - 3, 1))
                xx += cw
            yy += sh
        xcur += w + G
    ycur += h + G
q["mx"] = q.id.map(lambda i: geo[i][0]); q["my"] = q.id.map(lambda i: geo[i][1])
q["mw"] = q.id.map(lambda i: geo[i][2]); q["mh"] = q.id.map(lambda i: geo[i][3])
sec_df = pd.DataFrame(sec_rows)

# --- выгрузка ---
keep = ["id", "section", "section_name", "variety", "rootstock", "year_planted", "scheme", "area_ha", "trees_plan_ha", "trees_fact_ha",
        "vypad", "soil", "zone", "irrigation", "n_years", "fact_avg", "fact_2025_26", "benchmark_2027", "level_2027", "ci_low", "ci_high", "p25",
        "recoverable_2027", "with_program_2027", "kg_tree", "packout_pct", "category", "confidence", "main_reason", "winter_action", "spring_check",
        "field_visit", "in_300", "in_400", "in_500", "mx", "my", "mw", "mh"]
Q = q[keep].copy()
Q["vypad_pct"] = (Q.vypad * 100).round(1); Q = Q.drop(columns=["vypad"])
Q.to_json(f"{OUT}/quarters.json", orient="records", force_ascii=False)
Y[["id", "year", "t_ha"]].to_json(f"{OUT}/yields.json", orient="records", force_ascii=False)
L = pd.DataFrame(loss_rows); L["rub_ha"] = np.where(L.kind == "loss", (L.t_ha * 1000 * PRICE).round(-3), np.nan)
L["key"] = L.id + "#" + L.step.astype(str)
L.drop(columns=["fixable"], errors="ignore").to_json(f"{OUT}/losses.json", orient="records", force_ascii=False)
pd.DataFrame(years_out).to_json(f"{OUT}/years.json", orient="records", force_ascii=False)
summ_df.to_json(f"{OUT}/summary.json", orient="records", force_ascii=False)
S["key"] = S.scenario + " | " + S.norm
S.to_json(f"{OUT}/scenarios.json", orient="records", force_ascii=False)
sec_df.to_json(f"{OUT}/sections.json", orient="records", force_ascii=False)

# --- контроль ---
print("кварталов", n, "га", round(tot, 1))
print("sigma_u", round(math.sqrt(s2u), 3), "sigma_e", round(math.sqrt(s2e), 3))
w_all = (Y.merge(q[["id", "area_ha"]], on="id"))
print("средний факт, т/га (взвеш., все годы):", round((w_all.t_ha * w_all.area_ha).sum() / w_all.area_ha.sum(), 1))
print("средний факт без 2024:", round((w_all[w_all.year != 2024].t_ha * w_all[w_all.year != 2024].area_ha).sum() / w_all[w_all.year != 2024].area_ha.sum(), 1))
print(pd.DataFrame(years_out))
print(summ_df)
pd.set_option("display.width", 250); print(S[["scenario", "norm", "area_ha", "quarters", "trees_k", "cost_program_mln", "cost_sanitary_mln", "cost_total_mln", "harvest_program_t", "yield_program_t_ha", "cost_per_kg_rub", "gray_ha"]])
print(q.groupby(["category", "confidence"]).area_ha.sum().round(1))
print(q.groupby("variety")[["level_2027", "p25"]].mean().round(2))
print("field visit", q.field_visit.sum())
for f in os.listdir(OUT): print(f, os.path.getsize(f"{OUT}/{f}"))
