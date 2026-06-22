import { h, download } from "../lib/dom.js";
import { getAttendance } from "../lib/store.js";
import { buildBoard, classDatesInMonth } from "../lib/schedule.js";
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
  // 簡易: ハッシュ変更なしの再描画はストア通知に任せず、ここで局所更新
  const fresh = renderSummary(state);
  wrap.replaceWith(fresh);
}

function buildSummaryCard(state) {
  const { masters, students } = state;
  const rows = computeSummary(masters, students, ui.campusId, ui.year, ui.month);
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
        h("th", {}, "生徒名"), h("th", {}, "学年"), h("th", {}, "コマ数"),
        h("th", {}, "出席"), h("th", {}, "欠席"), h("th", {}, "遅刻"), h("th", {}, "早退"), h("th", {}, "振替"), h("th", {}, "出席率"),
      ])),
      h("tbody", {}, rows.map((r) =>
        h("tr", {}, [
          h("td", {}, [h("div", {}, r.name), h("div", { class: "kana" }, r.kana)]),
          h("td", {}, r.grade),
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

// 校舎・年月の全開講日についてコマ単位で集計
function computeSummary(masters, students, campusId, year, month) {
  const dates = classDatesInMonth(masters.timetable, campusId, year, month);
  const acc = {}; // code -> stats
  for (const date of dates) {
    const board = buildBoard({ timetable: masters.timetable, campuses: masters.campuses, students }, campusId, date);
    if (!board.hasClass) continue;
    for (const row of board.rows) {
      const code = row.student.code;
      if (!acc[code]) {
        acc[code] = { name: row.student.name, kana: row.student.kana, grade: row.student.grade,
          total: 0, 出席: 0, 欠席: 0, 遅刻: 0, 早退: 0, 振替: 0 };
      }
      for (const pid of board.periods) {
        if (row.cells[pid] == null) continue;
        acc[code].total++;
        const rec = getAttendance(campusId, date, pid, code);
        const status = rec ? rec.status : "出席";
        acc[code][status] = (acc[code][status] || 0) + 1;
      }
    }
  }
  return Object.values(acc).sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja"));
}

function exportSummary(rows, campusName) {
  const header = ["生徒名", "学年", "コマ数", "出席", "欠席", "遅刻", "早退", "振替", "出席率"];
  const data = [header, ...rows.map((r) => [
    r.name, r.grade, r.total, r.出席, r.欠席, r.遅刻, r.早退, r.振替,
    r.total ? `${Math.round((r.出席 / r.total) * 100)}%` : "",
  ])];
  download(`出席集計_${campusName}_${ui.year}-${String(ui.month).padStart(2, "0")}.csv`, toCsv(data), "text/csv;charset=utf-8");
}

function field(label, control) {
  return h("label", { class: "field" }, [h("span", { class: "field-label" }, label), control]);
}
