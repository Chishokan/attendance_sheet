// クラス（校舎×学年×パターン）とそのコマ（曜日・時限・科目）から、
// 「生徒 × その月の授業日（コマ）」の出席表を組み立てる。

// JS の getDay()(0=日..6=土) を 曜日ID(月=1..日=7) に変換
export function weekdayIdOfDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function gradeShort(grade) {
  return String(grade).replace("中学", "中").replace("年生", "");
}

// あるクラスの、指定年月における全コマを日付順に展開する。
// 返り値: [{ date, weekdayId, koma }]
export function classColumns(cls, year, month /* 1-12 */) {
  const cols = [];
  const last = new Date(year, month, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const date = new Date(year, month - 1, day);
    const js = date.getDay();
    const wid = js === 0 ? 7 : js;
    for (const koma of cls.komas) {
      if (koma.weekdayId === wid) cols.push({ date: ymd(date), weekdayId: wid, koma });
    }
  }
  cols.sort((a, b) => a.date.localeCompare(b.date) || a.koma.periodId - b.koma.periodId);
  return cols;
}

// 列を日付ごとにまとめる（2段ヘッダー用）。返り値: [{ date, weekdayId, cols:[...] }]
export function groupColumnsByDate(cols) {
  const map = new Map();
  for (const c of cols) {
    if (!map.has(c.date)) map.set(c.date, { date: c.date, weekdayId: c.weekdayId, cols: [] });
    map.get(c.date).cols.push(c);
  }
  return [...map.values()];
}

// クラスに属する生徒（校舎一致・学年一致・パターン科目を1つ以上受講）。
// 返り値: [{ student, enrollment }]（ふりがな順）
export function studentsInClass(students, campus, cls, patternSubjectIds) {
  const list = [];
  for (const code of Object.keys(students)) {
    const s = students[code];
    if (s.grade !== cls.grade) continue;
    const enr = s.enrollments.find((e) => e.campus === campus.name);
    if (!enr) continue;
    if (!patternSubjectIds.some((id) => enr.subjects.includes(id))) continue;
    list.push({ student: s, enrollment: enr });
  }
  list.sort((a, b) => (a.student.kana || a.student.name).localeCompare(b.student.kana || b.student.name, "ja"));
  return list;
}

// パターンの科目IDを取得
export function patternSubjectIds(masters, patternId) {
  return masters.patterns.find((p) => p.id === patternId)?.subjectIds || [];
}

// 校舎に属するクラス一覧（学年→パターン順）
export function classesForCampus(masters, campusId) {
  return masters.classes
    .filter((c) => c.campusId === campusId)
    .slice()
    .sort((a, b) => a.grade.localeCompare(b.grade, "ja") || String(a.pattern).localeCompare(String(b.pattern), "ja"));
}
