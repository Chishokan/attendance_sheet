import { h, download } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { defaultMasters } from "../lib/seed.js";

export function renderMasters(state) {
  const wrap = h("div", { class: "view" });
  wrap.appendChild(dataManagementCard(state));
  wrap.appendChild(periodsCard(state));
  wrap.appendChild(campusesCard(state));
  wrap.appendChild(subjectsCard(state));
  wrap.appendChild(timetableCard(state));
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

// ---- 時間割 ----
function timetableCard(state) {
  const { timetable, campuses, subjects, weekdays, periods } = state.masters;
  const campusName = (id) => campuses.find((c) => c.id === id)?.name || id;
  const subjName = (id) => subjects.find((c) => c.id === id)?.name || id;
  const weekdayName = (id) => weekdays.find((c) => c.id === id)?.name || id;

  const card = h("div", { class: "card" });
  card.appendChild(h("h3", {}, "時間割（校舎×学年×科目×曜日×時限）"));
  card.appendChild(h("p", { class: "muted small" }, "出席簿は、この時間割と受講CSVの科目をもとに自動生成されます。"));

  // 追加フォーム
  const grades = [...new Set([...timetable.map((t) => t.grade), "中学1年生", "中学2年生", "中学3年生", "小学4年生", "小学5年生", "小学6年生", "高校1年生", "高校2年生", "高校3年生"])];
  const fCampus = h("select", { class: "input" }, campuses.map((c) => h("option", { value: c.id }, c.name)));
  const fGrade = h("input", { class: "input", list: "grade-list", placeholder: "学年", value: "中学1年生" });
  const fGradeList = h("datalist", { id: "grade-list" }, grades.map((g) => h("option", { value: g })));
  const fSubject = h("select", { class: "input" }, subjects.map((s) => h("option", { value: s.id }, s.name)));
  const fWeekday = h("select", { class: "input" }, weekdays.map((w) => h("option", { value: w.id }, w.name)));
  const fPeriod = h("select", { class: "input" }, periods.map((p) => h("option", { value: p.id }, `${p.id}限(${p.start})`)));
  const addBtn = h("button", { class: "btn primary", onclick: () => {
    store.update((s) => {
      s.masters.timetable.push({
        campusId: Number(fCampus.value), grade: fGrade.value.trim(),
        subjectId: Number(fSubject.value), weekdayId: Number(fWeekday.value), periodId: Number(fPeriod.value),
      });
    });
  } }, "追加");

  card.appendChild(h("div", { class: "row gap wrap mb timetable-form" }, [
    fGradeList,
    field("校舎", fCampus), field("学年", fGrade), field("科目", fSubject),
    field("曜日", fWeekday), field("時限", fPeriod), addBtn,
  ]));

  // 一覧（校舎フィルタ）
  const filterSel = h("select", { class: "input", onchange: (e) => { renderRows(Number(e.target.value)); } },
    [h("option", { value: "0" }, "全校舎"), ...campuses.map((c) => h("option", { value: c.id }, c.name))]);
  card.appendChild(field("表示する校舎", filterSel));

  const tbody = h("tbody", {});
  function renderRows(filterCampus) {
    tbody.innerHTML = "";
    const list = timetable
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => !filterCampus || t.campusId === filterCampus)
      .sort((a, b) => a.t.campusId - b.t.campusId || a.t.grade.localeCompare(b.t.grade, "ja") || a.t.weekdayId - b.t.weekdayId || a.t.periodId - b.t.periodId);
    for (const { t, i } of list) {
      tbody.appendChild(h("tr", {}, [
        h("td", {}, campusName(t.campusId)),
        h("td", {}, t.grade),
        h("td", {}, subjName(t.subjectId)),
        h("td", {}, weekdayName(t.weekdayId) + "曜"),
        h("td", {}, `${t.periodId}限`),
        h("td", {}, h("button", { class: "btn tiny danger ghost", onclick: () => {
          store.update((s) => { s.masters.timetable.splice(i, 1); });
        } }, "削除")),
      ]));
    }
    if (list.length === 0) tbody.appendChild(h("tr", {}, h("td", { colspan: 6, class: "muted" }, "登録がありません。")));
  }
  renderRows(0);

  card.appendChild(h("div", { class: "table-scroll" }, [
    h("table", { class: "data-table compact" }, [
      h("thead", {}, h("tr", {}, [
        h("th", {}, "校舎"), h("th", {}, "学年"), h("th", {}, "科目"), h("th", {}, "曜日"), h("th", {}, "時限"), h("th", {}, ""),
      ])),
      tbody,
    ]),
  ]));
  return card;
}

function field(label, control) {
  return h("label", { class: "field" }, [h("span", { class: "field-label" }, label), control]);
}
