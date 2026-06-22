import { h, download } from "../lib/dom.js";
import { store, getAttendance, setAttendance, attKey } from "../lib/store.js";
import { classColumns, groupColumnsByDate, studentsInClass, patternSubjectIds, classesForCampus } from "../lib/schedule.js";
import { ATTENDANCE_STATUSES } from "../lib/seed.js";
import { toCsv } from "../lib/csv.js";

// 画面内で保持する選択状態（再描画をまたいで保持）。クラス別・月単位で表示する。
const today = new Date();
const ui = { campusId: null, classId: null, year: today.getFullYear(), month: today.getMonth() + 1 };

// 時間割画面などから「このクラスの出席表」を開くための入口。
export function selectClass(campusId, classId) {
  ui.campusId = campusId;
  ui.classId = classId;
  if (location.hash !== "#/attendance") location.hash = "#/attendance";
  else store.update(() => {});
}

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

  // 校舎の初期選択（受講データがある校舎を優先）
  if (ui.campusId == null) {
    const names = new Set();
    Object.values(students).forEach((s) => s.enrollments.forEach((e) => names.add(e.campus)));
    ui.campusId = (masters.campuses.find((c) => names.has(c.name)) || masters.campuses[0]).id;
  }

  const campus = masters.campuses.find((c) => c.id === ui.campusId);
  const classes = classesForCampus(masters, ui.campusId);

  // クラスの初期選択／校舎変更時の補正
  if (!classes.some((c) => c.id === ui.classId)) ui.classId = classes[0]?.id || null;
  const cls = classes.find((c) => c.id === ui.classId) || null;

  // ---- 操作バー（校舎・クラス・年・月） ----
  wrap.appendChild(h("div", { class: "card toolbar" }, [
    field("校舎", campusSelect(masters)),
    field("クラス", classSelect(classes)),
    field("年", yearSelect()),
    field("月", monthSelect()),
  ]));

  if (!cls) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("p", { class: "muted" }, `${campus?.name || ""} にクラスが登録されていません。「時間割」画面でクラスを追加してください。`),
    ]));
    return wrap;
  }

  wrap.appendChild(buildClassBoard(state, campus, cls));
  return wrap;
}

function buildClassBoard(state, campus, cls) {
  const { masters, students } = state;
  const subjById = Object.fromEntries(masters.subjects.map((s) => [s.id, s]));
  const periodById = Object.fromEntries(masters.periods.map((p) => [p.id, p]));
  const weekdayName = (id) => masters.weekdays.find((w) => w.id === id)?.name || "";

  const subjectIds = patternSubjectIds(masters, cls.pattern);
  const columns = classColumns(cls, ui.year, ui.month);
  const groups = groupColumnsByDate(columns);
  const roster = studentsInClass(students, campus, cls, subjectIds);

  const card = h("div", { class: "card" });
  card.appendChild(h("div", { class: "row between wrap" }, [
    h("div", {}, [
      h("h2", { class: "mb0" }, `${campus.name}　${cls.name}`),
      h("div", { class: "muted small" }, `${ui.year}年${ui.month}月 ・ 生徒 ${roster.length} 名 ・ 横スクロールで全日程を表示`),
    ]),
    h("div", { class: "row gap" }, [
      roster.length && columns.length
        ? h("button", { class: "btn", onclick: () => bulkAllPresent(cls, columns, roster, subjById) }, "全員出席")
        : null,
      h("button", { class: "btn ghost", onclick: () => exportCsv(state, campus, cls, columns, roster) }, "CSV出力"),
    ]),
  ]));

  if (columns.length === 0) {
    card.appendChild(h("p", { class: "muted mt" }, `${ui.year}年${ui.month}月 はこのクラスの開講日がありません。`));
    return card;
  }
  if (roster.length === 0) {
    card.appendChild(h("p", { class: "muted mt" }, "このクラスに該当する生徒がいません（校舎・学年・受講科目を確認してください）。"));
    return card;
  }

  // 2段ヘッダー: 1段目=日付, 2段目=科目(時刻)
  const head1 = h("tr", {}, [
    h("th", { class: "sticky-col", rowspan: 2 }, "生徒名"),
    h("th", { rowspan: 2 }, "学年"),
    ...groups.map((g) =>
      h("th", { colspan: g.cols.length, class: "date-th" }, `${fmtDate(g.date)}（${weekdayName(g.weekdayId)}）`)
    ),
  ]);
  const head2 = h("tr", {}, [
    ...columns.map((c) =>
      h("th", { class: "koma-th" }, [
        h("div", {}, subjById[c.koma.subjectId]?.short || ""),
        h("div", { class: "th-time" }, periodById[c.koma.periodId]?.start || ""),
      ])
    ),
  ]);

  const bodyRows = roster.map(({ student, enrollment }) => {
    const tds = [
      h("td", { class: "sticky-col name-cell" }, [
        h("div", {}, student.name || "(氏名不明)"),
        h("div", { class: "kana" }, student.kana || ""),
      ]),
      h("td", {}, gradeShortLabel(student.grade)),
    ];
    for (const c of columns) {
      const subjId = c.koma.subjectId;
      if (!enrollment.subjects.includes(subjId)) {
        tds.push(h("td", { class: "no-class" }, "")); // この科目は受講していない
        continue;
      }
      tds.push(attCell(c.date, subjId, student.code));
    }
    return h("tr", {}, tds);
  });

  card.appendChild(h("div", { class: "table-scroll" }, [
    h("table", { class: "attendance-table grid" }, [
      h("thead", {}, [head1, head2]),
      h("tbody", {}, bodyRows),
    ]),
  ]));
  return card;
}

// 1コマ分の出席セル（出席プルダウン＋必要時に理由）
function attCell(date, subjectId, code) {
  const rec = getAttendance(ui.campusId, date, subjectId, code) || { status: "出席", reason: "" };
  const reasonInput = h("input", {
    type: "text", class: "reason-input", placeholder: "理由", value: rec.reason || "",
    style: rec.status === "出席" ? "display:none" : "",
    onchange: (e) => {
      const cur = getAttendance(ui.campusId, date, subjectId, code) || { status: "出席", reason: "" };
      setAttendance(ui.campusId, date, subjectId, code, { status: cur.status, reason: e.target.value });
    },
  });
  const select = h("select", {
    class: "status-select status-" + statusClass(rec.status),
    onchange: (e) => {
      const status = e.target.value;
      const reason = status === "出席" ? "" : reasonInput.value || "";
      setAttendance(ui.campusId, date, subjectId, code, { status, reason });
      e.target.className = "status-select status-" + statusClass(status);
      reasonInput.style.display = status === "出席" ? "none" : "";
      if (status === "出席") reasonInput.value = "";
    },
  }, ATTENDANCE_STATUSES.map((st) => h("option", { value: st, selected: st === rec.status }, st)));

  return h("td", { class: "att-cell" }, h("div", { class: "att-inner" }, [select, reasonInput]));
}

function bulkAllPresent(cls, columns, roster, subjById) {
  store.update((s) => {
    for (const { student, enrollment } of roster) {
      for (const c of columns) {
        const subjId = c.koma.subjectId;
        if (!enrollment.subjects.includes(subjId)) continue;
        delete s.attendance[attKey(ui.campusId, c.date, subjId, student.code)];
      }
    }
  });
}

function exportCsv(state, campus, cls, columns, roster) {
  const subjById = Object.fromEntries(state.masters.subjects.map((s) => [s.id, s]));
  const weekdayName = (id) => state.masters.weekdays.find((w) => w.id === id)?.name || "";
  const header = ["校舎", "クラス", "日付", "曜日", "科目", "生徒ID", "生徒名", "学年", "出欠", "理由"];
  const rows = [header];
  for (const c of columns) {
    const subjId = c.koma.subjectId;
    for (const { student, enrollment } of roster) {
      if (!enrollment.subjects.includes(subjId)) continue;
      const rec = getAttendance(ui.campusId, c.date, subjId, student.code) || { status: "出席", reason: "" };
      rows.push([
        campus.name, cls.name, c.date, weekdayName(c.weekdayId), subjById[subjId]?.name || "",
        student.id || student.code, student.name, student.grade, rec.status, rec.reason || "",
      ]);
    }
  }
  download(`出席簿_${campus.name}_${cls.name}_${ui.year}-${String(ui.month).padStart(2, "0")}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

// ---- 操作バーの各プルダウン ----
function campusSelect(masters) {
  return h("select", {
    class: "input",
    onchange: (e) => { ui.campusId = Number(e.target.value); ui.classId = null; rerender(); },
  }, masters.campuses.map((c) => h("option", { value: c.id, selected: c.id === ui.campusId }, c.name)));
}

function classSelect(classes) {
  return h("select", {
    class: "input",
    onchange: (e) => { ui.classId = e.target.value; rerender(); },
  }, classes.map((c) => h("option", { value: c.id, selected: c.id === ui.classId }, c.name)));
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

function statusClass(status) {
  return { 出席: "present", 欠席: "absent", 遅刻: "late", 早退: "early", 振替: "makeup" }[status] || "present";
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function gradeShortLabel(grade) {
  return String(grade).replace("中学", "中").replace("年生", "");
}
