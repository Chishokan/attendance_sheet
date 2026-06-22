import { h } from "../lib/dom.js";
import { store, getAttendance, setAttendance } from "../lib/store.js";
import { buildBoard, classDatesInMonth, weekdayIdOfDate } from "../lib/schedule.js";
import { ATTENDANCE_STATUSES } from "../lib/seed.js";
import { toCsv } from "../lib/csv.js";
import { download } from "../lib/dom.js";

// 画面内で保持する選択状態（再描画をまたいで保持）
const today = new Date();
const ui = { campusId: null, year: today.getFullYear(), month: today.getMonth() + 1, date: null };

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
    const enrolledCampusNames = new Set();
    Object.values(students).forEach((s) => s.enrollments.forEach((e) => enrolledCampusNames.add(e.campus)));
    const firstCampus = masters.campuses.find((c) => enrolledCampusNames.has(c.name)) || masters.campuses[0];
    ui.campusId = firstCampus.id;
  }

  // 選択中の校舎×年月の開講日（授業日）一覧
  const classDates = classDatesInMonth(masters.timetable, ui.campusId, ui.year, ui.month);
  // 選択中の授業日が当月になければ先頭にリセット
  if (!classDates.includes(ui.date)) ui.date = classDates[0] || null;

  // ---- 操作バー（校舎別・月別のプルダウン選択） ----
  const campusSelect = h("select", {
    class: "input",
    onchange: (e) => { ui.campusId = Number(e.target.value); ui.date = null; rerender(); },
  }, masters.campuses.map((c) => h("option", { value: c.id, selected: c.id === ui.campusId }, c.name)));

  const years = [];
  for (let y = today.getFullYear() - 2; y <= today.getFullYear() + 1; y++) years.push(y);
  if (!years.includes(ui.year)) years.push(ui.year);
  years.sort((a, b) => a - b);
  const yearSelect = h("select", {
    class: "input narrow",
    onchange: (e) => { ui.year = Number(e.target.value); ui.date = null; rerender(); },
  }, years.map((y) => h("option", { value: y, selected: y === ui.year }, `${y}年`)));

  const monthSelect = h("select", {
    class: "input narrow",
    onchange: (e) => { ui.month = Number(e.target.value); ui.date = null; rerender(); },
  }, Array.from({ length: 12 }, (_, i) => h("option", { value: i + 1, selected: i + 1 === ui.month }, `${i + 1}月`)));

  const daySelect = h("select", {
    class: "input",
    onchange: (e) => { ui.date = e.target.value || null; rerender(); },
  }, classDates.length
    ? classDates.map((dt) => h("option", { value: dt, selected: dt === ui.date }, formatDayOption(dt, masters)))
    : [h("option", { value: "" }, "開講日なし")]);

  wrap.appendChild(h("div", { class: "card toolbar" }, [
    field("校舎", campusSelect),
    field("年", yearSelect),
    field("月", monthSelect),
    field("授業日", daySelect),
  ]));

  const campusName = masters.campuses.find((c) => c.id === ui.campusId)?.name || "";

  // 当月に開講日がない場合
  if (!ui.date) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("p", { class: "muted" }, `${campusName} は ${ui.year}年${ui.month}月 に開講予定がありません。校舎・月を変更してください。`),
    ]));
    return wrap;
  }

  // ---- 出席簿本体 ----
  const board = buildBoard({ timetable: masters.timetable, campuses: masters.campuses, students }, ui.campusId, ui.date);
  const wid = weekdayIdOfDate(ui.date);
  const weekdayName = masters.weekdays.find((w) => w.id === wid)?.name || "";

  if (!board.hasClass) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("p", { class: "muted" }, `${campusName} は ${formatDate(ui.date)}（${weekdayName}）に開講予定がありません。別の授業日を選択してください。`),
    ]));
    return wrap;
  }

  wrap.appendChild(buildBoardCard(state, board, campusName, weekdayName));
  return wrap;
}

function buildBoardCard(state, board, campusName, weekdayName) {
  const { masters } = state;
  const subjById = Object.fromEntries(masters.subjects.map((s) => [s.id, s]));
  const periodById = Object.fromEntries(masters.periods.map((p) => [p.id, p]));

  const card = h("div", { class: "card" });
  card.appendChild(h("div", { class: "row between wrap" }, [
    h("h2", {}, `${campusName} 出席簿`),
    h("div", { class: "muted" }, `${formatDate(ui.date)}（${weekdayName}）  受講者 ${board.rows.length} 名`),
  ]));

  card.appendChild(h("div", { class: "row gap wrap mb" }, [
    h("button", { class: "btn", onclick: () => bulkSet(board, "出席") }, "全員出席"),
    h("button", { class: "btn ghost", onclick: () => exportDayCsv(state, board, campusName) }, "この日をCSV出力"),
    h("span", { class: "saved-indicator" }, "入力は自動保存されます"),
  ]));

  // ヘッダー: 生徒 / 学年 / 各時限
  const headRow = h("tr", {}, [
    h("th", { class: "sticky-col" }, "生徒名"),
    h("th", {}, "学年"),
    ...board.periods.map((pid) =>
      h("th", {}, [
        h("div", {}, periodLabel(board.periods, pid)),
        h("div", { class: "th-time" }, periodById[pid]?.start || ""),
      ])
    ),
  ]);

  const bodyRows = board.rows.map((row) => {
    const tds = [
      h("td", { class: "sticky-col name-cell" }, [
        h("div", {}, row.student.name || "(氏名不明)"),
        h("div", { class: "kana" }, row.student.kana || ""),
      ]),
      h("td", {}, row.student.grade),
    ];
    for (const pid of board.periods) {
      const subjId = row.cells[pid];
      if (subjId == null) {
        tds.push(h("td", { class: "no-class" }, "—"));
        continue;
      }
      tds.push(h("td", { class: "att-cell" }, attCell(row.student.code, pid, subjById[subjId])));
    }
    return h("tr", {}, tds);
  });

  card.appendChild(h("div", { class: "table-scroll" }, [
    h("table", { class: "attendance-table" }, [
      h("thead", {}, headRow),
      h("tbody", {}, bodyRows),
    ]),
  ]));

  return card;
}

function attCell(code, pid, subject) {
  const rec = getAttendance(ui.campusId, ui.date, pid, code) || { status: "出席", reason: "" };
  const reasonInput = h("input", {
    type: "text", class: "reason-input", placeholder: "理由", value: rec.reason || "",
    style: rec.status === "出席" ? "display:none" : "",
    onchange: (e) => {
      const cur = getAttendance(ui.campusId, ui.date, pid, code) || { status: "出席", reason: "" };
      setAttendance(ui.campusId, ui.date, pid, code, { status: cur.status, reason: e.target.value });
    },
  });
  const select = h("select", {
    class: "status-select status-" + statusClass(rec.status),
    onchange: (e) => {
      const status = e.target.value;
      const cur = getAttendance(ui.campusId, ui.date, pid, code) || { reason: "" };
      setAttendance(ui.campusId, ui.date, pid, code, { status, reason: status === "出席" ? "" : cur.reason || "" });
      e.target.className = "status-select status-" + statusClass(status);
      reasonInput.style.display = status === "出席" ? "none" : "";
      if (status === "出席") reasonInput.value = "";
    },
  }, ATTENDANCE_STATUSES.map((st) => h("option", { value: st, selected: st === rec.status }, st)));

  return h("div", { class: "att-inner" }, [
    h("div", { class: "subj-tag" }, subject?.short || ""),
    select,
    reasonInput,
  ]);
}

function bulkSet(board, status) {
  store.update((s) => {
    for (const row of board.rows) {
      for (const pid of board.periods) {
        if (row.cells[pid] == null) continue;
        const key = `${ui.campusId}|${ui.date}|${pid}|${row.student.code}`;
        if (status === "出席") delete s.attendance[key];
        else s.attendance[key] = { status, reason: "" };
      }
    }
  });
}

function exportDayCsv(state, board, campusName) {
  const subjById = Object.fromEntries(state.masters.subjects.map((s) => [s.id, s]));
  const header = ["生徒ID", "生徒名", "学年", "受講科目"];
  for (const pid of board.periods) {
    header.push(periodLabel(board.periods, pid), periodLabel(board.periods, pid) + "/理由");
  }
  const rows = [header];
  for (const row of board.rows) {
    const subjects = row.enrollment.subjects.map((id) => subjById[id]?.short || "").join(" ");
    const line = [row.student.id || row.student.code, row.student.name, row.student.grade, subjects];
    for (const pid of board.periods) {
      if (row.cells[pid] == null) { line.push("", ""); continue; }
      const rec = getAttendance(ui.campusId, ui.date, pid, row.student.code) || { status: "出席", reason: "" };
      line.push(rec.status, rec.reason || "");
    }
    rows.push(line);
  }
  download(`出席簿_${campusName}_${ui.date}.csv`, toCsv(rows), "text/csv;charset=utf-8");
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

// 授業日プルダウン用ラベル: 「6/2（火）」
function formatDayOption(dateStr, masters) {
  const d = new Date(dateStr + "T00:00:00");
  const wid = d.getDay() === 0 ? 7 : d.getDay();
  const weekdayName = masters.weekdays.find((w) => w.id === wid)?.name || "";
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdayName}）`;
}
