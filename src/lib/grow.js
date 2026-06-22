// Grow顧客管理システムからエクスポートした2種類のCSVを解析する。
//   会員CSV : 生徒マスタ（氏名・学年・ホーム教室・保護者メール 等）
//   受講CSV : 受講情報（所属教室＝校舎・科目フラグ・学校名）
// どちらも grow が API を持たないため、画面から貼り付け/アップロードして取り込む。
import { parseDelimited } from "./csv.js";

// ヘッダー行のうち、含まれるキーワードに最初に一致した列インデックスを返す。
function findCol(header, ...keywords) {
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] || "").trim();
    if (keywords.some((k) => h === k)) return i;
  }
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] || "").trim();
    if (keywords.some((k) => h.includes(k))) return i;
  }
  return -1;
}

const isTruthy = (v) => {
  const s = (v || "").trim();
  return s !== "" && s !== "0";
};

// 受講CSV の科目列ラベル → 科目ID（seed.js の SUBJECTS と対応）
const SUBJECT_COLUMN_MAP = [
  { key: "国語", id: 1 },
  { key: "算数", id: 6 },
  { key: "数学", id: 2 },
  { key: "英語", id: 3 },
  { key: "理科", id: 4 },
  { key: "社会", id: 5 },
  { key: "作文", id: 7 },
  { key: "適性", id: 8 },
  { key: "英検対策", id: 9 },
];

// 会員CSV を解析 → { code -> studentMaster }
export function parseMembers(text) {
  const rows = parseDelimited(text);
  if (rows.length < 2) return {};
  const header = rows[0];
  const col = {
    code: findCol(header, "生徒システムコード", "システムコード"),
    home: findCol(header, "ホーム教室"),
    lastName: findCol(header, "生徒名漢字（苗字）", "生徒名漢字(苗字)"),
    firstName: findCol(header, "生徒名漢字（名前）", "生徒名漢字(名前)"),
    lastKana: findCol(header, "生徒名かな（苗字）", "生徒名かな(苗字)"),
    firstKana: findCol(header, "生徒名かな（名前）", "生徒名かな(名前)"),
    grade: findCol(header, "学年名", "学年"),
    id: findCol(header, "生徒ID"),
    emailGuardianMobile: findCol(header, "保護者携帯メール1"),
    emailGuardianPc: findCol(header, "保護者パソコンメール1"),
    emailStudentMobile: findCol(header, "生徒携帯メール"),
    emailStudentPc: findCol(header, "生徒パソコンメール"),
    deleted: findCol(header, "削除フラグ"),
  };
  const get = (row, idx) => (idx >= 0 ? (row[idx] || "").trim() : "");

  const members = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = get(row, col.code);
    if (!code) continue;
    if (col.deleted >= 0 && isTruthy(get(row, col.deleted))) continue; // 退会・削除は除外
    const email =
      get(row, col.emailGuardianMobile) ||
      get(row, col.emailGuardianPc) ||
      get(row, col.emailStudentMobile) ||
      get(row, col.emailStudentPc);
    members[code] = {
      code,
      id: get(row, col.id),
      lastName: get(row, col.lastName),
      firstName: get(row, col.firstName),
      lastKana: get(row, col.lastKana),
      firstKana: get(row, col.firstKana),
      grade: get(row, col.grade),
      homeCampus: get(row, col.home),
      guardianEmail: email,
    };
  }
  return members;
}

// 受講CSV を解析 → 受講行の配列 [{ code, campus, subjects:[id], school, name... }]
export function parseEnrollments(text) {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  const col = {
    code: findCol(header, "システムコード", "生徒システムコード"),
    campus: findCol(header, "【教室名】", "教室名"),
    juku: findCol(header, "【塾名】", "塾名"),
    lastName: findCol(header, "【生徒苗字(漢字)】", "生徒苗字(漢字)"),
    firstName: findCol(header, "【生徒名前(漢字)】", "生徒名前(漢字)"),
    lastKana: findCol(header, "【生徒苗字(かな)】", "生徒苗字(かな)"),
    firstKana: findCol(header, "【生徒名前(かな)】", "生徒名前(かな)"),
    elementary: findCol(header, "【小学校】", "小学校"),
    junior: findCol(header, "【中学校】", "中学校"),
    high: findCol(header, "【高等学校】", "高等学校"),
  };
  // 科目列のインデックスを特定する。
  // ラベルから括弧（"(得点)" など）を除いた語が科目名と一致する列だけを対象にし、
  // 「教室名」等の誤検出を防ぐ。
  const subjectCols = [];
  for (let i = 0; i < header.length; i++) {
    const label = (header[i] || "").trim().replace(/[（(].*?[）)]/g, "").trim();
    const m = SUBJECT_COLUMN_MAP.find((s) => s.key === label);
    if (m) subjectCols.push({ idx: i, id: m.id });
  }
  const get = (row, idx) => (idx >= 0 ? (row[idx] || "").trim() : "");

  const enrollments = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = get(row, col.code);
    const campus = get(row, col.campus);
    if (!code || !campus) continue;
    const subjects = subjectCols.filter((s) => isTruthy(get(row, s.idx))).map((s) => s.id);
    enrollments.push({
      code,
      campus,
      subjects,
      lastName: get(row, col.lastName),
      firstName: get(row, col.firstName),
      lastKana: get(row, col.lastKana),
      firstKana: get(row, col.firstKana),
      school: get(row, col.junior) || get(row, col.elementary) || get(row, col.high),
    });
  }
  return enrollments;
}

// 会員 + 受講 を統合し、生徒リストと校舎別受講を作る。
// members が無くても受講CSV単独で氏名を補完できる。
export function mergeStudents(members, enrollments) {
  const students = {};
  const ensure = (code) => {
    if (!students[code]) {
      students[code] = {
        code,
        id: "",
        name: "",
        kana: "",
        grade: "",
        homeCampus: "",
        guardianEmail: "",
        enrollments: [], // [{ campus, subjects:[id], school }]
      };
    }
    return students[code];
  };

  for (const code of Object.keys(members)) {
    const m = members[code];
    const s = ensure(code);
    s.id = m.id;
    s.name = `${m.lastName}${m.firstName}`.trim();
    s.kana = `${m.lastKana}${m.firstKana}`.trim();
    s.grade = m.grade;
    s.homeCampus = m.homeCampus;
    s.guardianEmail = m.guardianEmail;
  }

  for (const e of enrollments) {
    const s = ensure(e.code);
    if (!s.name) s.name = `${e.lastName}${e.firstName}`.trim();
    if (!s.kana) s.kana = `${e.lastKana}${e.firstKana}`.trim();
    s.enrollments.push({ campus: e.campus, subjects: e.subjects, school: e.school });
  }

  return students;
}
