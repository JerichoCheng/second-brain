import { describe, expect, it } from "vitest";
import { parseFile, serialize, updateRaw } from "../src/frontmatter.js";

describe("parseFile", () => {
  it("日期保持为字符串，不转换成 Date", () => {
    const { data } = parseFile("---\ndue: 2026-10-17\nstart: 2026-10-17T09:00\n---\n");
    expect(data).toEqual({ due: "2026-10-17", start: "2026-10-17T09:00" });
  });

  it("没有 frontmatter 时整个文件都是正文", () => {
    expect(parseFile("# 标题\n\n正文")).toMatchObject({ data: {}, body: "# 标题\n\n正文" });
  });

  it("YAML 写错时返回 error，不抛异常", () => {
    const p = parseFile("---\nstatus: [next\n---\nbody");
    expect(p.error).toBeTruthy();
    expect(p.body).toBe("body");
  });

  it("兼容 BOM 和 CRLF", () => {
    const p = parseFile("\uFEFF---\r\nstatus: next\r\n---\r\n\r\n正文\r\n");
    expect(p.data).toEqual({ status: "next" });
    expect(p.body).toBe("正文\n");
    expect(p.crlf).toBe(true);
  });
});

describe("serialize", () => {
  it("wikilink 加引号，日期不加引号，false 和空值不写入", () => {
    const text = serialize({
      status: "next",
      due: "2026-10-17",
      project: "[[CITS2002]]",
      people: ["[[Alice]]", "[[Bob]]"],
      my_day: false,
      labels: [],
      note: null,
    }, "正文");
    expect(text).toBe(
      '---\nstatus: next\ndue: 2026-10-17\nproject: "[[CITS2002]]"\npeople: ["[[Alice]]", "[[Bob]]"]\n---\n\n正文\n',
    );
    expect(parseFile(text).data.project).toBe("[[CITS2002]]");
  });

  it("容易被误解析的字符串会加引号", () => {
    const text = serialize({ a: "123", b: "x: y", c: "true" });
    expect(parseFile(text).data).toEqual({ a: "123", b: "x: y", c: "true" });
  });
});

describe("updateRaw", () => {
  const original = "---\n# 顶部注释\nstatus: next # 行尾注释\npriority: high\nunknown_field: 保留\ndue: 2026-10-01\n---\n\n正文第一行\n";

  it("只改指定的键，保留其他键的顺序和注释", () => {
    const out = updateRaw(original, { status: "done", completed: "2026-10-03" });
    expect(out).toBe(
      "---\n# 顶部注释\nstatus: done # 行尾注释\npriority: high\nunknown_field: 保留\ndue: 2026-10-01\ncompleted: 2026-10-03\n---\n\n正文第一行\n",
    );
  });

  it("值为空则删除键", () => {
    const out = updateRaw(original, { due: null, priority: undefined });
    expect(out).not.toMatch(/due:|priority:/);
    expect(out).toContain("unknown_field: 保留");
  });

  it("可以同时替换正文", () => {
    expect(updateRaw(original, {}, "新正文")).toMatch(/---\n\n新正文\n$/);
  });

  it("给没有 frontmatter 的文件加上 frontmatter", () => {
    expect(updateRaw("只有正文\n", { status: "inbox" })).toBe("---\nstatus: inbox\n---\n\n只有正文\n");
  });

  it("删光所有键后去掉 frontmatter", () => {
    expect(updateRaw("---\na: 1\n---\n\n正文\n", { a: null })).toBe("正文\n");
  });

  it("保持 CRLF", () => {
    const out = updateRaw("---\r\na: 1\r\n---\r\n\r\nx\r\ny\r\n", { b: 2 });
    expect(out).toBe("---\r\na: 1\r\nb: 2\r\n---\r\n\r\nx\r\ny\r\n");
  });

  it("YAML 有错误时拒绝修改，避免丢数据", () => {
    expect(() => updateRaw("---\na: [1\n---\n", { b: 1 })).toThrow(/拒绝修改/);
  });
});
