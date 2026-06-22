// 初期マスタ。クラス（校舎×学年×パターン）を中心にしたモデル。
// すべて画面の「時間割」「設定」から編集できます（個人情報は含みません）。

export const WEEKDAYS = [
  { id: 1, name: "月" },
  { id: 2, name: "火" },
  { id: 3, name: "水" },
  { id: 4, name: "木" },
  { id: 5, name: "金" },
  { id: 6, name: "土" },
  { id: 7, name: "日" },
];

export const CAMPUSES = [
  { id: 1, name: "佐世保駅前校" },
  { id: 2, name: "大野校" },
  { id: 3, name: "日野校" },
  { id: 4, name: "早岐校" },
  { id: 5, name: "日宇校" },
  { id: 6, name: "佐々校" },
  { id: 7, name: "中高一貫精鋭クラス" },
  { id: 8, name: "北中コース" },
  { id: 9, name: "県立中受検対策" },
  { id: 10, name: "プリンス英米学院" },
];

// 受講CSV の科目列の並び順と一致させています（grow.js が参照）。
export const SUBJECTS = [
  { id: 1, name: "国語", short: "国" },
  { id: 6, name: "算数", short: "算" },
  { id: 2, name: "数学", short: "数" },
  { id: 3, name: "英語", short: "英" },
  { id: 4, name: "理科", short: "理" },
  { id: 5, name: "社会", short: "社" },
  { id: 7, name: "作文", short: "作" },
  { id: 8, name: "適性", short: "適" },
  { id: 9, name: "英検対策", short: "英検" },
];

export const PERIODS = [
  { id: 1, start: "17:50" },
  { id: 2, start: "18:50" },
  { id: 3, start: "19:50" },
  { id: 4, start: "20:50" },
];

// クラスのパターン。英数＝英・数、国理社＝国・理・社。
export const PATTERNS = [
  { id: "英数", name: "英数", subjectIds: [3, 2] },     // 英, 数
  { id: "国理社", name: "国理社", subjectIds: [1, 4, 5] }, // 国, 理, 社
];

// 中学校学年（クラスを作る学年）
export const CLASS_GRADES = ["中学1年生", "中学2年生", "中学3年生"];

export function gradeShort(grade) {
  return String(grade).replace("中学", "中").replace("年生", "");
}

// パターンごとのコマ（曜日・時限・科目）のひな型。
// 英数=週2回（数=月 / 英=木）、国理社=週1回（金に 国・理・社）。校舎ごとに編集可能。
function defaultKomas(pattern) {
  if (pattern === "英数") {
    return [
      { weekdayId: 1, periodId: 3, subjectId: 2, teacher: "" }, // 月 19:50 数
      { weekdayId: 4, periodId: 3, subjectId: 3, teacher: "" }, // 木 19:50 英
    ];
  }
  return [
    { weekdayId: 5, periodId: 2, subjectId: 1, teacher: "" }, // 金 18:50 国
    { weekdayId: 5, periodId: 3, subjectId: 4, teacher: "" }, // 金 19:50 理
    { weekdayId: 5, periodId: 4, subjectId: 5, teacher: "" }, // 金 20:50 社
  ];
}

// クラスを初期生成する校舎（新スプレッドシートに登場する校舎）
const SEED_CLASS_CAMPUS_IDS = [1, 2, 3, 5];

function buildSeedClasses() {
  const classes = [];
  for (const campusId of SEED_CLASS_CAMPUS_IDS) {
    for (const grade of CLASS_GRADES) {
      for (const pattern of PATTERNS) {
        classes.push({
          id: `${campusId}-${gradeShort(grade)}-${pattern.id}`,
          campusId,
          grade,
          pattern: pattern.id,
          name: `${gradeShort(grade)}${pattern.id}`,
          komas: defaultKomas(pattern.id),
        });
      }
    }
  }
  return classes;
}

export const CLASSES = buildSeedClasses();

export const ATTENDANCE_STATUSES = ["出席", "欠席", "遅刻", "早退", "振替"];

export function defaultMasters() {
  // ディープコピー（編集してもシードを汚さない）
  return JSON.parse(JSON.stringify({
    weekdays: WEEKDAYS,
    campuses: CAMPUSES,
    subjects: SUBJECTS,
    periods: PERIODS,
    patterns: PATTERNS,
    classes: CLASSES,
  }));
}
