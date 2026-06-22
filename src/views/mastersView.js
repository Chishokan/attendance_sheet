import { h, download } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { defaultMasters } from "../lib/seed.js";

export function renderMasters(state) {
  const wrap = h("div", { class: "view" });
  wrap.appendChild(dataManagementCard(state));
  wrap.appendChild(periodsCard(state));
  wrap.appendChild(campusesCard(state));
  wrap.appendChild(subjectsCard(state));
  return wrap;
}

// ---- バックアップ / 復元 ----
function dataManagementCard(state) {
  const fileInput = h("input", {
    type: "file", accept: "application/json,.json",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.masters && !data.students) throw new Error("形式が不正です");
        store.replace({ ...store.get(), ...data });
        alert("バックアップを復元しました。");
      } catch (err) {
        alert("読み込みに失敗しました: " + err.message);
      }
    },
  });

  return h("div", { class: "card" }, [
    h("h2", {}, "データ管理"),
    h("p", { class: "muted small" }, "出席データはこのブラウザ内にのみ保存されます。端末の共有・引き継ぎ・バックアップにはエクスポートを使ってください。"),
    h("div", { class: "row gap wrap" }, [
      h("button", { class: "btn primary", onclick: () => {
        const json = JSON.stringify(store.get(), null, 2);
        download(`出席簿バックアップ_${new Date().toISOString().slice(0, 10)}.json`, json, "application/json");
      } }, "バックアップを書き出す"),
      h("label", { class: "file-label btn ghost" }, ["バックアップを復元", fileInput]),
      h("button", { class: "btn danger ghost", onclick: () => {
        if (confirm("時間割などの設定を初期状態に戻します。生徒データと出席記録は保持されます。よろしいですか？")) {
          store.update((s) => { s.masters = defaultMasters(); });
        }
      } }, "設定を初期化"),
      h("button", { class: "btn danger ghost", onclick: () => {
        if (confirm("すべてのデータ（生徒・出席・設定）を削除します。元に戻せません。よろしいですか？")) store.reset();
      } }, "全データ削除"),
    ]),
  ]);
}

// ---- 時限（開始時刻） ----
function periodsCard(state) {
  const { periods } = state.masters;
  return h("div", { class: "card" }, [
    h("h3", {}, "時限（開始時刻）"),
    h("table", { class: "data-table compact" }, [
      h("thead", {}, h("tr", {}, [h("th", {}, "時限ID"), h("th", {}, "開始時刻")])),
      h("tbody", {}, periods.map((p) =>
        h("tr", {}, [
          h("td", {}, String(p.id)),
          h("td", {}, h("input", {
            type: "time", class: "input narrow", value: p.start,
            onchange: (e) => store.update((s) => {
              s.masters.periods.find((x) => x.id === p.id).start = e.target.value;
            }),
          })),
        ])
      )),
    ]),
  ]);
}

// ---- 校舎 ----
function campusesCard(state) {
  const { campuses } = state.masters;
  return h("div", { class: "card" }, [
    h("h3", {}, "校舎"),
    h("table", { class: "data-table compact" }, [
      h("thead", {}, h("tr", {}, [h("th", {}, "ID"), h("th", {}, "校舎名")])),
      h("tbody", {}, campuses.map((c) =>
        h("tr", {}, [
          h("td", {}, String(c.id)),
          h("td", {}, h("input", {
            class: "input", value: c.name,
            onchange: (e) => store.update((s) => { s.masters.campuses.find((x) => x.id === c.id).name = e.target.value; }),
          })),
        ])
      )),
    ]),
    h("p", { class: "muted small" }, "※ 校舎名は受講CSVの「教室名」と一致させてください（一致した生徒が出席簿に表示されます）。"),
  ]);
}

// ---- 科目 ----
function subjectsCard(state) {
  const { subjects } = state.masters;
  return h("div", { class: "card" }, [
    h("h3", {}, "科目"),
    h("table", { class: "data-table compact" }, [
      h("thead", {}, h("tr", {}, [h("th", {}, "ID"), h("th", {}, "科目名"), h("th", {}, "略称")])),
      h("tbody", {}, subjects.map((sub) =>
        h("tr", {}, [
          h("td", {}, String(sub.id)),
          h("td", {}, h("input", { class: "input", value: sub.name,
            onchange: (e) => store.update((s) => { s.masters.subjects.find((x) => x.id === sub.id).name = e.target.value; }) })),
          h("td", {}, h("input", { class: "input narrow", value: sub.short,
            onchange: (e) => store.update((s) => { s.masters.subjects.find((x) => x.id === sub.id).short = e.target.value; }) })),
        ])
      )),
    ]),
  ]);
}

function field(label, control) {
  return h("label", { class: "field" }, [h("span", { class: "field-label" }, label), control]);
}
