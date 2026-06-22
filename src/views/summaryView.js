import { h, download } from "../lib/dom.js";
import { getAttendance } from "../lib/store.js";
import { classColumns, studentsInClass, patternSubjectIds, classesForCampus } from "../lib/schedule.js";
import { toCsv } from "../lib/csv.js";

const now = new Date();
const ui = { campusId: null, year: now.getFullYear(), month: now.getMonth() + 1 };

export function renderSummary(state) {
  const { masters, students } = state;
  const wrap = h("div", { class: "view" });

  if (Object.keys(students).length === 0) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("h2", {}, "集計"),
      h("p", { class: "muted" }, "生徒データがありません。"),
    ]));
    return wrap;
  }
  if (ui.campusId == null) ui.campusId = masters.campuses[0].id;

  const campusSel = h("select", { class: "input", onchange: (e) => { ui.campusId = Number(e.target.value); rerender(wrap, state); } },
    masters.campuses.map((c) => h("option", { value: c.id, selected: c.id === ui.campusId }, c.name)));
  const yearInput = h("input", { type: "number", class: "input narrow", value: ui.year, onchange: (e) => { ui.year = Number(e.target.value); rerender(wrap, state); } });
  const monthSel = h("select", { class: "input narrow", onchange: (e) => { ui.month = Number(e.target.value); rerender(wrap, state); } },
    Array.from({ length: 12 }, (_, i) => h("option", { value: i + 1, selected: i + 1 === ui.month }, `${i + 1}月`)));

  wrap.appendChild(h("div", { class: "card toolbar" }, [
    field("校舎", campusSel), field("年", yearInput), field("月", monthSel),
  ]));

  wrap.appendChild(buildSummaryCard(state));
  return wrap;
}

function rerender(wrap, state) {
  wrap.replaceWith(renderSummary(state));
}

function buildSummaryCard(state) {
  const { masters } = state;
  const rows = computeSummary(state, ui.campusId, ui.year, ui.month);
  const campusName = masters.campuses.find((c) => c.id === ui.campusId)?.name || "";

  const card = h("div", { class: "card" });
  card.appendChild(h("div", { class: "row between wrap" }, [
    h("h2", {}, `${campusName} ${ui.year}年${ui.month}月 出席集計`),
    h("button", { class: "btn ghost", onclick: () => exportSummary(rows, campusName) }, "CSV出力"),
  ]));

  if (rows.length === 0) {
    card.appendChild(h("p", { class: "muted" }, "対象の受講者・開講日がありません。"));
    return card;
  }

  card.appendChild(h("div", { class: "table-scroll" }, [
    h("table", { class: "data-table" }, [
      h("thead", {}, h("tr", {}, [
        h("th", {}, "生徒名"), h("th", {}, "学年"), h("th", {}, "クラス"), h("th", {}, "コマ数"),
        h("th", {}, "出席"), h("th", {}, "欠席"), h("th", {}, "遅刻"), h("th", {}, "早退"), h("th", {}, "振替"), h("th", {}, "出席率"),
      ])),
      h("tbody", {}, rows.map((r) =>
        h("tr", {}, [
          h("td", {}, [h("div", {}, r.name), h("div", { class: "kana" }, r.kana)]),
          h("td", {}, gradeShort(r.grade)),
          h("td", { class: "small" }, r.classes.join(" / ")),
          h("td", {}, r.total),
          h("td", {}, r.出席),
          h("td", { class: r.欠席 ? "warn-num" : "" }, r.欠席),
          h("td", {}, r.遅刻),
          h("td", {}, r.早退),
          h("td", {}, r.振替),
          h("td", {}, r.total ? `${Math.round((r.出席 / r.total) * 100)}%` : "—"),
        ])
      )),
    ]),
  ]));
  return card;
}

// 校舎の全クラス・全コマについて、生徒ごとに集計
function computeSummary(state, campusId, year, month) {
  const { masters, students } = state;
  const campus = masters.campuses.find((c) => c.id === campusId);
  if (!campus) return [];
  const acc = {}; // code -> stats
  const ensure = (s) => {
    if (!acc[s.code]) acc[s.code] = { name: s.name, kana: s.kana, grade: s.grade, classes: [],
      total: 0, 出席: 0, 欠席: 0, 遅刻: 0, 早退: 0, 振替: 0 };
    return acc[s.code];
  };

  for (const cls of classesForCampus(masters, campusId)) {
    const subjectIds = patternSubjectIds(masters, cls.pattern);
    const columns = classColumns(cls, year, month);
    const roster = studentsInClass(students, campus, cls, subjectIds);
    for (const { student, enrollment } of roster) {
      const stat = ensure(student);
      if (!stat.classes.includes(cls.name)) stat.classes.push(cls.name);
      for (const c of columns) {
        const subjId = c.koma.subjectId;
        if (!enrollment.subjects.includes(subjId)) continue;
        stat.total++;
        const rec = getAttendance(campusId, c.date, subjId, student.code);
        const status = rec ? rec.status : "出席";
        stat[status] = (stat[status] || 0) + 1;
      }
    }
  }
  return Object.values(acc).sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja"));
}

function exportSummary(rows, campusName) {
  const header = ["生徒名", "学年", "クラス", "コマ数", "出席", "欠席", "遅刻", "早退", "振替", "出席率"];
  const data = [header, ...rows.map((r) => [
    r.name, r.grade, r.classes.join(" "), r.total, r.出席, r.欠席, r.遅刻, r.早退, r.振替,
    r.total ? `${Math.round((r.出席 / r.total) * 100)}%` : "",
  ])];
  download(`出席集計_${campusName}_${ui.year}-${String(ui.month).padStart(2, "0")}.csv`, toCsv(data), "text/csv;charset=utf-8");
}

function gradeShort(grade) {
  return String(grade).replace("中学", "中").replace("年生", "");
}

function field(label, control) {
  return h("label", { class: "field" }, [h("span", { class: "field-label" }, label), control]);
}
