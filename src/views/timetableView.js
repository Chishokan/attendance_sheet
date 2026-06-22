import { h } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { classesForCampus, gradeShort } from "../lib/schedule.js";
import { selectClass } from "./attendanceView.js";

const ui = { campusId: null };

export function renderTimetable(state) {
  const { masters } = state;
  const wrap = h("div", { class: "view" });

  if (ui.campusId == null) ui.campusId = masters.campuses[0].id;
  const campus = masters.campuses.find((c) => c.id === ui.campusId);
  const classes = classesForCampus(masters, ui.campusId);

  // ---- ヘッダー / 校舎選択 ----
  wrap.appendChild(h("div", { class: "card" }, [
    h("h2", {}, "時間割管理"),
    h("p", { class: "muted small" }, "クラス（学年×パターン）ごとにコマ（曜日・時限・科目・担当）を管理します。各コマの「出席表」からそのクラスの出席入力へ移動できます。"),
    h("div", { class: "toolbar" }, [
      field("校舎", campusSelect(masters)),
      addClassControl(masters, classes),
    ]),
  ]));

  if (classes.length === 0) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("p", { class: "muted" }, `${campus.name} にクラスがありません。上の「クラス追加」から作成してください。`),
    ]));
    return wrap;
  }

  const grid = h("div", { class: "class-grid" });
  for (const cls of classes) grid.appendChild(classCard(state, campus, cls));
  wrap.appendChild(grid);
  return wrap;
}

function classCard(state, campus, cls) {
  const { masters } = state;
  const subjById = Object.fromEntries(masters.subjects.map((s) => [s.id, s]));
  const weekdayName = (id) => masters.weekdays.find((w) => w.id === id)?.name || "";
  const periodById = Object.fromEntries(masters.periods.map((p) => [p.id, p]));

  const card = h("div", { class: "card class-card" });
  card.appendChild(h("div", { class: "row between wrap class-card-head" }, [
    h("div", {}, [
      h("h3", { class: "mb0" }, cls.name),
      h("div", { class: "muted small" }, `${cls.grade} ・ ${cls.pattern}（週${weekDaysOfClass(cls).length}回 / ${cls.komas.length}コマ）`),
    ]),
    h("div", { class: "row gap" }, [
      h("button", { class: "btn tiny primary", onclick: () => selectClass(cls.campusId, cls.id) }, "出席表"),
      h("button", { class: "btn tiny danger ghost", onclick: () => removeClass(cls.id) }, "クラス削除"),
    ]),
  ]));

  // コマ一覧（曜日・時限・科目・担当）
  const tbody = h("tbody", {});
  cls.komas
    .map((k, i) => ({ k, i }))
    .sort((a, b) => a.k.weekdayId - b.k.weekdayId || a.k.periodId - b.k.periodId)
    .forEach(({ k, i }) => tbody.appendChild(komaRow(masters, cls, k, i)));

  card.appendChild(h("table", { class: "data-table compact komas" }, [
    h("thead", {}, h("tr", {}, [
      h("th", {}, "曜日"), h("th", {}, "時限"), h("th", {}, "科目"), h("th", {}, "担当"), h("th", {}, ""),
    ])),
    tbody,
  ]));

  card.appendChild(h("button", { class: "btn tiny mt", onclick: () => addKoma(cls.id) }, "＋ コマ追加"));
  return card;
}

function komaRow(masters, cls, koma, index) {
  const update = (patch) => store.update((s) => {
    const c = s.masters.classes.find((x) => x.id === cls.id);
    Object.assign(c.komas[index], patch);
  });

  const weekdaySel = h("select", { class: "input narrow", onchange: (e) => update({ weekdayId: Number(e.target.value) }) },
    masters.weekdays.map((w) => h("option", { value: w.id, selected: w.id === koma.weekdayId }, w.name)));
  const periodSel = h("select", { class: "input narrow", onchange: (e) => update({ periodId: Number(e.target.value) }) },
    masters.periods.map((p) => h("option", { value: p.id, selected: p.id === koma.periodId }, `${p.id}限(${p.start})`)));
  const subjectSel = h("select", { class: "input narrow", onchange: (e) => update({ subjectId: Number(e.target.value) }) },
    masters.subjects.map((s) => h("option", { value: s.id, selected: s.id === koma.subjectId }, s.name)));
  const teacher = h("input", { class: "input narrow", value: koma.teacher || "", placeholder: "担当",
    onchange: (e) => update({ teacher: e.target.value }) });

  return h("tr", { class: "koma-row" }, [
    h("td", {}, weekdaySel),
    h("td", {}, periodSel),
    h("td", {}, subjectSel),
    h("td", {}, teacher),
    h("td", {}, [
      h("button", { class: "btn tiny", title: "このコマのクラスの出席表へ", onclick: () => selectClass(cls.campusId, cls.id) }, "出席表"),
      h("button", { class: "btn tiny danger ghost", onclick: () => removeKoma(cls.id, index) }, "削除"),
    ]),
  ]);
}

function addClassControl(masters, classes) {
  const gradeSel = h("select", { class: "input narrow" },
    ["中学1年生", "中学2年生", "中学3年生", "小学6年生", "高校1年生"].map((g) => h("option", { value: g }, g)));
  const patternSel = h("select", { class: "input narrow" },
    masters.patterns.map((p) => h("option", { value: p.id }, p.id)));
  const btn = h("button", { class: "btn", onclick: () => {
    const grade = gradeSel.value, pattern = patternSel.value;
    const id = `${ui.campusId}-${gradeShort(grade)}-${pattern}-${Date.now().toString(36)}`;
    store.update((s) => {
      s.masters.classes.push({
        id, campusId: ui.campusId, grade, pattern, name: `${gradeShort(grade)}${pattern}`, komas: [],
      });
    });
  } }, "クラス追加");
  return field("クラス追加", h("div", { class: "row gap" }, [gradeSel, patternSel, btn]));
}

// ---- 操作 ----
function campusSelect(masters) {
  return h("select", { class: "input", onchange: (e) => { ui.campusId = Number(e.target.value); store.update(() => {}); } },
    masters.campuses.map((c) => h("option", { value: c.id, selected: c.id === ui.campusId }, c.name)));
}

function addKoma(classId) {
  store.update((s) => {
    const c = s.masters.classes.find((x) => x.id === classId);
    const subj = c.komas[0]?.subjectId || s.masters.subjects[0].id;
    c.komas.push({ weekdayId: 1, periodId: 3, subjectId: subj, teacher: "" });
  });
}

function removeKoma(classId, index) {
  store.update((s) => {
    const c = s.masters.classes.find((x) => x.id === classId);
    c.komas.splice(index, 1);
  });
}

function removeClass(classId) {
  if (!confirm("このクラスを削除します。よろしいですか？（出席記録は残ります）")) return;
  store.update((s) => {
    s.masters.classes = s.masters.classes.filter((c) => c.id !== classId);
  });
}

function weekDaysOfClass(cls) {
  return [...new Set(cls.komas.map((k) => k.weekdayId))];
}

function field(label, control) {
  return h("label", { class: "field" }, [h("span", { class: "field-label" }, label), control]);
}
