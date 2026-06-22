import { h } from "../lib/dom.js";
import { store, getAttendance, setAttendance } from "../lib/store.js";
import { buildBoard, classDatesInMonth, weekdayIdOfDate } from "../lib/schedule.js";
import { ATTENDANCE_STATUSES } from "../lib/seed.js";
import { toCsv } from "../lib/csv.js";
import { download } from "../lib/dom.js";

// 画面内で保持する選択状態（再描画をまたいで保持）。日付は持たず月間分をまとめて表示する。
const today = new Date();
const ui = { campusId: null, year: today.getFullYear(), month: today.getMonth() + 1 };

export function renderAttendance(state) {
  const { masters, students } = state;
  const wrap = h("div", { class: "view" });

  if (Object.keys(students).length === 0) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("h2", {}, "出欠入力"),
      h("p", { class: "muted" }, "まだ生徒データがありません。"),
      h("a", { class: "btn primary", href: "#/import" }, "データ取込へ"),
    ]));
    return wrap;
  }

  if (ui.campusId == null) {
    // 受講データのある校舎を初期選択
    const names = new Set();
    Object.values(students).forEach((s) => s.enrollments.forEach((e) => names.add(e.campus)));
    ui.campusId = (masters.campuses.find((c) => names.has(c.name)) || masters.campuses[0]).id;
  }

  const campusName = masters.campuses.find((c) => c.id === ui.campusId)?.name || "";
  const classDates = classDatesInMonth(masters.timetable, ui.campusId, ui.year, ui.month);

  // ---- 操作バー（校舎別・月別のプルダウン選択） ----
  wrap.appendChild(h("div", { class: "card toolbar" }, [
    field("校舎", campusSelect(masters)),
    field("年", yearSelect()),
    field("月", monthSelect()),
  ]));

  if (classDates.length === 0) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("p", { class: "muted" }, `${campusName} は ${ui.year}年${ui.month}月 に開講予定がありません。校舎・月を変更してください。`),
    ]));
    return wrap;
  }

  // ---- 月間ヘッダー（件数・CSV出力） ----
  wrap.appendChild(h("div", { class: "card row between wrap" }, [
    h("div", {}, [
      h("h2", { class: "mb0" }, `${campusName} ${ui.year}年${ui.month}月 出席簿`),
      h("div", { class: "muted small" }, `開講 ${classDates.length} 日 ・ 下にスクロールして月間の出欠を確認・入力できます`),
    ]),
    h("button", { class: "btn ghost", onclick: () => exportMonthCsv(state, classDates, campusName) }, "月間CSV出力"),
  ]));

  // ---- 日ごとのセクションを縦に並べる（月間一覧） ----
  const list = h("div", { class: "month-list" });
  for (const date of classDates) {
    const board = buildBoard({ timetable: masters.timetable, campuses: masters.campuses, students }, ui.campusId, date);
    list.appendChild(buildDaySection(state, board, date));
  }
  wrap.appendChild(list);
  return wrap;
}

// 1日分の出席簿セクション（見出し＋テーブル）
function buildDaySection(state, board, dateStr) {
  const { masters } = state;
  const subjById = Object.fromEntries(masters.subjects.map((s) => [s.id, s]));
  const periodById = Object.fromEntries(masters.periods.map((p) => [p.id, p]));
  const wid = weekdayIdOfDate(dateStr);
  const weekdayName = masters.weekdays.find((w) => w.id === wid)?.name || "";

  const section = h("div", { class: "card day-section" });
  section.appendChild(h("div", { class: "row between wrap day-head" }, [
    h("h3", { class: "mb0" }, `${formatDate(dateStr)}（${weekdayName}）`),
    h("div", { class: "row gap" }, [
      h("span", { class: "muted small" }, `受講者 ${board.rows.length} 名`),
      board.rows.length
        ? h("button", { class: "btn tiny", onclick: () => bulkSetDay(board, dateStr, "出席") }, "この日を全員出席")
        : null,
    ]),
  ]));

  if (board.rows.length === 0) {
    section.appendChild(h("p", { class: "muted small" }, "対象の受講者がいません。"));
    return section;
  }

  // ヘッダー: 生徒名 / 学年 / 受講科目 / 各限目（出席＋理由の2列セット）
  const headRow = h("tr", {}, [
    h("th", { class: "sticky-col" }, "生徒名"),
    h("th", {}, "学年"),
    h("th", {}, "受講科目"),
    ...board.periods.flatMap((pid) => [
      h("th", {}, [
        h("div", {}, periodLabel(board.periods, pid)),
        h("div", { class: "th-time" }, periodById[pid]?.start || ""),
      ]),
      h("th", { class: "reason-th" }, "理由"),
    ]),
  ]);

  const bodyRows = board.rows.map((row) => {
    const subjects = [...new Set(row.enrollment.subjects)].map((id) => subjById[id]?.short || "").join(" ");
    const tds = [
      h("td", { class: "sticky-col name-cell" }, [
        h("div", {}, row.student.name || "(氏名不明)"),
        h("div", { class: "kana" }, row.student.kana || ""),
      ]),
      h("td", {}, row.student.grade),
      h("td", { class: "subj-col" }, subjects),
    ];
    for (const pid of board.periods) {
      if (row.cells[pid] == null) {
        tds.push(h("td", { class: "no-class" }, ""), h("td", { class: "no-class" }, ""));
        continue;
      }
      tds.push(...attCells(row.student.code, pid, dateStr));
    }
    return h("tr", {}, tds);
  });

  section.appendChild(h("div", { class: "table-scroll" }, [
    h("table", { class: "attendance-table" }, [
      h("thead", {}, headRow),
      h("tbody", {}, bodyRows),
    ]),
  ]));
  return section;
}

// 1つの限目について「出席プルダウン」と「理由」の2つの<td>を返す。
function attCells(code, pid, dateStr) {
  const rec = getAttendance(ui.campusId, dateStr, pid, code) || { status: "出席", reason: "" };
  const reasonInput = h("input", {
    type: "text", class: "reason-input", placeholder: "理由", value: rec.reason || "",
    onchange: (e) => {
      const cur = getAttendance(ui.campusId, dateStr, pid, code) || { status: "出席", reason: "" };
      setAttendance(ui.campusId, dateStr, pid, code, { status: cur.status, reason: e.target.value });
    },
  });
  const select = h("select", {
    class: "status-select status-" + statusClass(rec.status),
    onchange: (e) => {
      const status = e.target.value;
      const reason = status === "出席" ? "" : reasonInput.value || "";
      setAttendance(ui.campusId, dateStr, pid, code, { status, reason });
      e.target.className = "status-select status-" + statusClass(status);
      if (status === "出席") reasonInput.value = "";
    },
  }, ATTENDANCE_STATUSES.map((st) => h("option", { value: st, selected: st === rec.status }, st)));

  return [
    h("td", { class: "att-cell" }, select),
    h("td", { class: "reason-cell" }, reasonInput),
  ];
}

function bulkSetDay(board, dateStr, status) {
  store.update((s) => {
    for (const row of board.rows) {
      for (const pid of board.periods) {
        if (row.cells[pid] == null) continue;
        const key = `${ui.campusId}|${dateStr}|${pid}|${row.student.code}`;
        if (status === "出席") delete s.attendance[key];
        else s.attendance[key] = { status, reason: "" };
      }
    }
  });
}

// 月間の出欠をロング形式（1コマ1行）でCSV出力
function exportMonthCsv(state, classDates, campusName) {
  const { masters, students } = state;
  const subjById = Object.fromEntries(masters.subjects.map((s) => [s.id, s]));
  const periodById = Object.fromEntries(masters.periods.map((p) => [p.id, p]));
  const header = ["日付", "曜日", "生徒ID", "生徒名", "学年", "受講科目", "限目", "開始時刻", "科目", "出欠", "理由"];
  const rows = [header];
  for (const date of classDates) {
    const board = buildBoard({ timetable: masters.timetable, campuses: masters.campuses, students }, ui.campusId, date);
    const wid = weekdayIdOfDate(date);
    const weekdayName = masters.weekdays.find((w) => w.id === wid)?.name || "";
    for (const row of board.rows) {
      const subjects = [...new Set(row.enrollment.subjects)].map((id) => subjById[id]?.short || "").join(" ");
      for (const pid of board.periods) {
        const subjId = row.cells[pid];
        if (subjId == null) continue;
        const rec = getAttendance(ui.campusId, date, pid, row.student.code) || { status: "出席", reason: "" };
        rows.push([
          date, weekdayName, row.student.id || row.student.code, row.student.name, row.student.grade, subjects,
          periodLabel(board.periods, pid), periodById[pid]?.start || "", subjById[subjId]?.name || "", rec.status, rec.reason || "",
        ]);
      }
    }
  }
  download(`出席簿_${campusName}_${ui.year}-${String(ui.month).padStart(2, "0")}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

// ---- 操作バーの各プルダウン ----
function campusSelect(masters) {
  return h("select", {
    class: "input",
    onchange: (e) => { ui.campusId = Number(e.target.value); rerender(); },
  }, masters.campuses.map((c) => h("option", { value: c.id, selected: c.id === ui.campusId }, c.name)));
}

function yearSelect() {
  const years = [];
  for (let y = today.getFullYear() - 2; y <= today.getFullYear() + 1; y++) years.push(y);
  if (!years.includes(ui.year)) years.push(ui.year);
  years.sort((a, b) => a - b);
  return h("select", {
    class: "input narrow",
    onchange: (e) => { ui.year = Number(e.target.value); rerender(); },
  }, years.map((y) => h("option", { value: y, selected: y === ui.year }, `${y}年`)));
}

function monthSelect() {
  return h("select", {
    class: "input narrow",
    onchange: (e) => { ui.month = Number(e.target.value); rerender(); },
  }, Array.from({ length: 12 }, (_, i) => h("option", { value: i + 1, selected: i + 1 === ui.month }, `${i + 1}月`)));
}

// ---- 補助 ----
function rerender() { store.update(() => {}); }

function field(label, control) {
  return h("label", { class: "field" }, [h("span", { class: "field-label" }, label), control]);
}

function periodLabel(periods, pid) {
  // 当日開講される時限を 1限目, 2限目… と連番表示
  return `${periods.indexOf(pid) + 1}限目`;
}

function statusClass(status) {
  return { 出席: "present", 欠席: "absent", 遅刻: "late", 早退: "early", 振替: "makeup" }[status] || "present";
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
