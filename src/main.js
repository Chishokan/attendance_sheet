import { h, clear } from "./lib/dom.js";
import { store } from "./lib/store.js";
import { renderImport } from "./views/importView.js";
import { renderAttendance } from "./views/attendanceView.js";
import { renderTimetable } from "./views/timetableView.js";
import { renderRoster } from "./views/rosterView.js";
import { renderMasters } from "./views/mastersView.js";
import { renderSummary } from "./views/summaryView.js";

const ROUTES = [
  { id: "attendance", label: "出欠入力", render: renderAttendance },
  { id: "timetable", label: "時間割", render: renderTimetable },
  { id: "import", label: "データ取込", render: renderImport },
  { id: "roster", label: "生徒一覧", render: renderRoster },
  { id: "summary", label: "集計", render: renderSummary },
  { id: "masters", label: "設定", render: renderMasters },
];

const appEl = document.getElementById("app");
const navEl = document.getElementById("nav");

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  return ROUTES.find((r) => r.id === hash) || ROUTES[0];
}

function renderNav() {
  clear(navEl);
  const active = currentRoute();
  for (const r of ROUTES) {
    navEl.appendChild(
      h("a", {
        href: `#/${r.id}`,
        class: "nav-link" + (r.id === active.id ? " active" : ""),
      }, r.label)
    );
  }
}

function render() {
  renderNav();
  clear(appEl);
  const route = currentRoute();
  try {
    appEl.appendChild(route.render(store.get()));
  } catch (e) {
    console.error(e);
    appEl.appendChild(h("div", { class: "card error" }, `画面の描画でエラーが発生しました: ${e.message}`));
  }
}

window.addEventListener("hashchange", render);
store.subscribe(render);
render();
