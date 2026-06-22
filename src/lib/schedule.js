// 時間割（時間割マスタ）と受講情報から、ある校舎・日付の「出席簿」を組み立てる。

// JS の getDay()(0=日..6=土) を 曜日ID(月=1..日=7) に変換
export function weekdayIdOfDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const js = d.getDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 指定校舎で、その月に授業がある日付の一覧（時間割の曜日に該当する日）を返す。
export function classDatesInMonth(timetable, campusId, year, month /* 1-12 */) {
  const weekdays = new Set(timetable.filter((t) => t.campusId === campusId).map((t) => t.weekdayId));
  const dates = [];
  const last = new Date(year, month, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const date = new Date(year, month - 1, day);
    const js = date.getDay();
    const wid = js === 0 ? 7 : js;
    if (weekdays.has(wid)) dates.push(ymd(date));
  }
  return dates;
}

// ある校舎・日付の出席簿を構築する。
// 返り値:
//   { hasClass, periods:[periodId...], rows:[{ student, cells:{periodId: subjectId} }] }
// - periods: その日に開講される時限の一覧（時間割から導出、昇順）
// - rows   : その日に1コマ以上授業がある生徒。cells は「その時限に受ける科目」
export function buildBoard({ timetable, campuses, students }, campusId, dateStr) {
  const campus = campuses.find((c) => c.id === campusId);
  if (!campus) return { hasClass: false, periods: [], rows: [] };
  const wid = weekdayIdOfDate(dateStr);

  // その校舎・曜日の開講コマ
  const daySessions = timetable.filter((t) => t.campusId === campusId && t.weekdayId === wid);
  if (daySessions.length === 0) return { hasClass: false, periods: [], rows: [] };

  // 学年→科目→時限 の索引
  const usedPeriods = new Set();
  const rows = [];

  for (const code of Object.keys(students)) {
    const s = students[code];
    // この校舎に在籍している受講情報（複数教室に在籍する生徒に対応）
    const enr = s.enrollments.find((e) => e.campus === campus.name);
    if (!enr) continue;

    // この生徒（学年）が、受講科目について当日受けるコマ
    const cells = {}; // periodId -> subjectId
    for (const sess of daySessions) {
      if (sess.grade !== s.grade) continue;
      if (!enr.subjects.includes(sess.subjectId)) continue;
      cells[sess.periodId] = sess.subjectId;
      usedPeriods.add(sess.periodId);
    }
    if (Object.keys(cells).length === 0) continue; // 当日授業なし
    rows.push({ student: s, enrollment: enr, cells });
  }

  const periods = [...usedPeriods].sort((a, b) => a - b);
  rows.sort((a, b) => (a.student.kana || a.student.name).localeCompare(b.student.kana || b.student.name, "ja"));
  return { hasClass: true, periods, rows };
}
