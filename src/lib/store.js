// アプリ全体の状態管理。localStorage に永続化し、変更を購読できる簡易ストア。
import { defaultMasters } from "./seed.js";

const STORAGE_KEY = "attendance-app-v1";

function emptyState() {
  return {
    version: 1,
    masters: defaultMasters(),
    students: {}, // code -> student
    // 出席記録: `${campusId}|${date}|${periodId}|${code}` -> { status, reason }
    attendance: {},
    importedAt: null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    // 後方互換: 不足キーを補完
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      masters: { ...base.masters, ...(parsed.masters || {}) },
      students: parsed.students || {},
      attendance: parsed.attendance || {},
    };
  } catch (e) {
    console.error("状態の読み込みに失敗しました。初期化します。", e);
    return emptyState();
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("保存に失敗しました（容量超過の可能性）。", e);
    alert("データの保存に失敗しました。ブラウザの容量制限の可能性があります。");
  }
}

function notify() {
  for (const fn of listeners) fn(state);
}

export const store = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  // 状態を更新（mutator は state を直接変更する）し、保存＋通知する。
  // silent=true のときは保存のみ行い再描画しない（セルが自前でDOM更新済みの場合に使用）。
  update(mutator, { silent = false } = {}) {
    mutator(state);
    persist();
    if (!silent) notify();
  },
  replace(next) {
    state = next;
    persist();
    notify();
  },
  reset() {
    state = emptyState();
    persist();
    notify();
  },
};

// ---- 出席記録のヘルパー ----
export const attKey = (campusId, date, periodId, code) => `${campusId}|${date}|${periodId}|${code}`;

export function getAttendance(campusId, date, periodId, code) {
  return store.get().attendance[attKey(campusId, date, periodId, code)] || null;
}

export function setAttendance(campusId, date, periodId, code, record, { silent = true } = {}) {
  store.update((s) => {
    const key = attKey(campusId, date, periodId, code);
    if (!record || (record.status === "出席" && !record.reason)) {
      // 既定（出席・理由なし）は記録を持たず容量を節約。未記録＝出席扱い。
      delete s.attendance[key];
    } else {
      s.attendance[key] = record;
    }
  }, { silent });
}
