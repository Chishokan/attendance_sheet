import { h } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { parseMembers, parseEnrollments, mergeStudents } from "../lib/grow.js";

export function renderImport(state) {
  const wrap = h("div", { class: "view" });

  wrap.appendChild(
    h("div", { class: "card" }, [
      h("h2", {}, "データ取込"),
      h("p", { class: "muted" }, [
        "Grow顧客管理システムから書き出した ",
        h("b", {}, "会員CSV"),
        " と ",
        h("b", {}, "受講CSV"),
        " を貼り付け（またはファイル選択）して取り込みます。Grow は API を持たないため、CSV を手動でエクスポートして読み込みます。",
      ]),
    ])
  );

  const memberBox = makeInputBox("会員CSV（生徒マスタ）", "生徒システムコード, 生徒名, 学年, ホーム教室, 保護者メール 等");
  const courseBox = makeInputBox("受講CSV（受講情報）", "システムコード, 科目フラグ, 【教室名】=校舎, 学校名 等");
  wrap.appendChild(memberBox.el);
  wrap.appendChild(courseBox.el);

  const status = h("div", { class: "import-status" });

  const importBtn = h("button", {
    class: "btn primary",
    onclick: () => {
      const memberText = memberBox.getValue();
      const courseText = courseBox.getValue();
      if (!memberText.trim() && !courseText.trim()) {
        renderStatus(status, { error: "少なくとも一方のCSVを入力してください。" });
        return;
      }
      try {
        const members = memberText.trim() ? parseMembers(memberText) : {};
        const enrollments = courseText.trim() ? parseEnrollments(courseText) : [];
        const students = mergeStudents(members, enrollments);
        const count = Object.keys(students).length;
        if (count === 0) {
          renderStatus(status, { error: "生徒データを読み取れませんでした。ヘッダー行を含めて貼り付けてください。" });
          return;
        }
        store.update((s) => {
          s.students = students;
          s.importedAt = new Date().toISOString();
        });
        renderStatus(status, {
          ok: `取込完了: 生徒 ${count} 名 / 会員CSV ${Object.keys(members).length} 件 / 受講CSV ${enrollments.length} 件`,
          students,
        });
      } catch (e) {
        console.error(e);
        renderStatus(status, { error: "解析中にエラーが発生しました: " + e.message });
      }
    },
  }, "取り込む");

  wrap.appendChild(h("div", { class: "card" }, [
    h("div", { class: "row gap" }, [importBtn]),
    status,
  ]));

  // 現在の取込状況
  const studentCount = Object.keys(state.students).length;
  if (studentCount > 0) {
    wrap.appendChild(h("div", { class: "card subtle" }, [
      h("p", {}, [
        `現在 ${studentCount} 名の生徒データを保持しています。`,
        state.importedAt ? `（最終取込: ${new Date(state.importedAt).toLocaleString("ja-JP")}）` : "",
      ]),
    ]));
  }

  return wrap;
}

function makeInputBox(title, hint) {
  const ta = h("textarea", {
    class: "csv-input",
    rows: 6,
    placeholder: "ここにCSV（またはスプレッドシートのセル範囲）を貼り付け",
  });
  const file = h("input", {
    type: "file",
    accept: ".csv,text/csv,.tsv,.txt",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (f) ta.value = await f.text();
    },
  });
  const el = h("div", { class: "card" }, [
    h("h3", {}, title),
    h("p", { class: "muted small" }, hint),
    ta,
    h("div", { class: "row gap small" }, [h("label", { class: "file-label" }, ["ファイルを選択 ", file])]),
  ]);
  return { el, getValue: () => ta.value };
}

function renderStatus(container, { ok, error, students }) {
  container.innerHTML = "";
  if (error) {
    container.appendChild(h("div", { class: "alert error" }, error));
    return;
  }
  container.appendChild(h("div", { class: "alert ok" }, ok));
  if (students) {
    const sample = Object.values(students).slice(0, 8);
    container.appendChild(
      h("table", { class: "preview" }, [
        h("thead", {}, h("tr", {}, [
          h("th", {}, "生徒名"), h("th", {}, "学年"), h("th", {}, "受講校舎"),
        ])),
        h("tbody", {}, sample.map((s) =>
          h("tr", {}, [
            h("td", {}, s.name || "(不明)"),
            h("td", {}, s.grade),
            h("td", {}, s.enrollments.map((e) => e.campus).join(" / ")),
          ])
        )),
      ])
    );
    container.appendChild(h("p", { class: "muted small" }, "※ 先頭8名のプレビュー。「生徒一覧」で全件確認できます。"));
  }
}
