import { h } from "../lib/dom.js";

const ui = { query: "", campus: "", grade: "" };

export function renderRoster(state) {
  const { students, masters } = state;
  const subjById = Object.fromEntries(masters.subjects.map((s) => [s.id, s]));
  const wrap = h("div", { class: "view" });

  const all = Object.values(students);
  if (all.length === 0) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("h2", {}, "生徒一覧"),
      h("p", { class: "muted" }, "生徒データがありません。「データ取込」から読み込んでください。"),
    ]));
    return wrap;
  }

  // フィルタ用の候補
  const campusNames = [...new Set(all.flatMap((s) => s.enrollments.map((e) => e.campus)))].sort();
  const grades = [...new Set(all.map((s) => s.grade).filter(Boolean))].sort();

  const search = h("input", {
    type: "search", class: "input", placeholder: "氏名・かな・IDで検索", value: ui.query,
    oninput: (e) => { ui.query = e.target.value; refresh(); },
  });
  const campusSel = h("select", { class: "input", onchange: (e) => { ui.campus = e.target.value; refresh(); } },
    [h("option", { value: "" }, "全校舎"), ...campusNames.map((c) => h("option", { value: c, selected: c === ui.campus }, c))]);
  const gradeSel = h("select", { class: "input", onchange: (e) => { ui.grade = e.target.value; refresh(); } },
    [h("option", { value: "" }, "全学年"), ...grades.map((g) => h("option", { value: g, selected: g === ui.grade }, g))]);

  wrap.appendChild(h("div", { class: "card toolbar" }, [
    field("検索", search), field("校舎", campusSel), field("学年", gradeSel),
  ]));

  const tableCard = h("div", { class: "card" });
  wrap.appendChild(tableCard);

  function refresh() {
    const q = ui.query.trim().toLowerCase();
    const rows = all
      .filter((s) => {
        if (ui.campus && !s.enrollments.some((e) => e.campus === ui.campus)) return false;
        if (ui.grade && s.grade !== ui.grade) return false;
        if (q) {
          const hay = `${s.name}${s.kana}${s.id}${s.code}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, "ja"));

    tableCard.innerHTML = "";
    tableCard.appendChild(h("div", { class: "muted small mb" }, `${rows.length} 名`));
    tableCard.appendChild(h("div", { class: "table-scroll" }, [
      h("table", { class: "data-table" }, [
        h("thead", {}, h("tr", {}, [
          h("th", {}, "生徒名"), h("th", {}, "学年"), h("th", {}, "受講校舎"),
          h("th", {}, "受講科目"), h("th", {}, "保護者メール"),
        ])),
        h("tbody", {}, rows.map((s) =>
          h("tr", {}, [
            h("td", {}, [h("div", {}, s.name || "(不明)"), h("div", { class: "kana" }, s.kana || "")]),
            h("td", {}, s.grade),
            h("td", {}, s.enrollments.map((e) => e.campus).join(" / ")),
            h("td", {}, [...new Set(s.enrollments.flatMap((e) => e.subjects))]
              .map((id) => subjById[id]?.short || "").join(" ")),
            h("td", { class: "small" }, s.guardianEmail || ""),
          ])
        )),
      ]),
    ]));
  }
  refresh();
  return wrap;
}

function field(label, control) {
  return h("label", { class: "field" }, [h("span", { class: "field-label" }, label), control]);
}
