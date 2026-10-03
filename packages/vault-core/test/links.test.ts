import { describe, expect, it } from "vitest";
import { extractLinks, invalidTitle, relationTargets, replaceLinks } from "../src/links.js";
import { makeVault, md, read } from "./helpers.js";

describe("链接解析", () => {
  it("各种写法", () => {
    expect(extractLinks("[[A]] [[B|别名]] [[C#标题]] ![[D]] [[ E ]]")).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("忽略代码块和行内代码", () => {
    expect(extractLinks("[[A]]\n```\n[[B]]\n```\n`[[C]]` [[D]]")).toEqual(["A", "D"]);
  });

  it("关联值：引号写法、纯文本、忘了加引号的嵌套数组", () => {
    expect(relationTargets("[[A]]")).toEqual(["A"]);
    expect(relationTargets(["[[A]]", "[[B]]"])).toEqual(["A", "B"]);
    expect(relationTargets("A")).toEqual(["A"]);
    expect(relationTargets([["A"]])).toEqual(["A"]); // project: [[A]]
  });

  it("替换时保留别名、锚点、嵌入，跳过代码", () => {
    const text = "[[Old]] [[old|别名]] [[Old#第三周]] ![[Old]] [[Older]] `[[Old]]`";
    expect(replaceLinks(text, "Old", "New")).toBe("[[New]] [[New|别名]] [[New#第三周]] ![[New]] [[Older]] `[[Old]]`");
  });

  it("文件名合法性（Windows）", () => {
    expect(invalidTitle("CITS2002 Project 2")).toBeNull();
    expect(invalidTitle("a/b")).toBeTruthy();
    expect(invalidTitle("问题?")).toBeTruthy();
    expect(invalidTitle("CON")).toBeTruthy();
    expect(invalidTitle("结尾有点.")).toBeTruthy();
  });
});

const FILES = {
  "projects/CITS2002.md": md("status: active", "本页面链接自己：[[CITS2002]]"),
  "tasks/写 Project 2.md": md("status: next\nproject: \"[[CITS2002]]\"  # 课程项目"),
  "tasks/复习.md": md("status: next\nproject: [[cits2002]]"),
  "notes/第三周笔记.md": md(
    "kind: lecture\nproject: \"[[CITS2002]]\"",
    "见 [[CITS2002|这门课]] 和 [[CITS2002#Week 3]]。\n\n```c\n// [[CITS2002]] 代码里的不改\n```",
  ),
  "people/Alice.md": md("relationship: [classmate]"),
};

describe("反向链接", () => {
  it("frontmatter 和正文里的链接都算，名字不区分大小写", async () => {
    const { vault } = await makeVault(FILES);
    expect(vault.backlinks("cits2002").map((e) => e.name).sort())
      .toEqual(["CITS2002", "复习", "写 Project 2", "第三周笔记"].sort());
    expect(vault.referrers("CITS2002", "tasks", "project")).toHaveLength(2);
  });

  it("找出断掉的链接", async () => {
    const { vault } = await makeVault({ "tasks/t.md": md("status: next\nproject: \"[[不存在的项目]]\"") });
    expect(vault.danglingLinks()).toEqual([{ from: "tasks/t.md", target: "不存在的项目" }]);
  });
});

describe("重命名（阶段 1 完成标准）", () => {
  it("改名后所有引用同步更新", async () => {
    const { vault, root } = await makeVault(FILES);
    const { entry, updated } = await vault.rename("CITS2002", "CITS2002 Systems Programming");

    expect(entry.path).toBe("projects/CITS2002 Systems Programming.md");
    expect(updated.sort()).toEqual(["notes/第三周笔记.md", "tasks/复习.md", "tasks/写 Project 2.md"].sort());
    expect(vault.get("CITS2002")).toBeUndefined();

    expect(await read(root, "tasks/写 Project 2.md")).toContain('project: "[[CITS2002 Systems Programming]]"  # 课程项目');
    expect(await read(root, "tasks/复习.md")).toContain("project: [[CITS2002 Systems Programming]]");
    const note = await read(root, "notes/第三周笔记.md");
    expect(note).toContain("[[CITS2002 Systems Programming|这门课]]");
    expect(note).toContain("[[CITS2002 Systems Programming#Week 3]]");
    expect(note).toContain("// [[CITS2002]] 代码里的不改");
    expect(await read(root, "projects/CITS2002 Systems Programming.md")).toContain("[[CITS2002 Systems Programming]]");

    // 索引同步：查询和计算字段都指向新名字
    expect(vault.referrers("CITS2002 Systems Programming", "tasks", "project")).toHaveLength(2);
    expect(vault.value(entry, "tasks")).toBe(2);
    const { groups } = vault.query("tasks", "按项目");
    expect(groups!.map((g) => g.key)).toContain("CITS2002 Systems Programming");
    expect(vault.danglingLinks()).toEqual([]);
  });

  it("新名字已存在时拒绝；只改大小写可以", async () => {
    const { vault } = await makeVault(FILES);
    await expect(vault.rename("CITS2002", "alice")).rejects.toThrow(/已经有名为/);
    const { entry } = await vault.rename("CITS2002", "cits2002");
    expect(entry.name).toBe("cits2002");
  });

  it("非法文件名", async () => {
    const { vault } = await makeVault(FILES);
    await expect(vault.rename("CITS2002", "a:b")).rejects.toThrow();
  });
});
