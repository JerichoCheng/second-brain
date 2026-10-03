import { describe, expect, it } from "vitest";
import { bundledSchemaDir } from "../src/init.js";
import { loadSchemas, parseSchema, validateSchemas } from "../src/schema.js";

describe("默认 schema", () => {
  it("全部自洽：关联、计算字段、视图引用的字段都存在", async () => {
    const schemas = await loadSchemas(bundledSchemaDir());
    expect(schemas.size).toBe(17);
    expect(validateSchemas(schemas)).toEqual([]);
  });

  it("每个视图都有名字和类型", async () => {
    for (const s of (await loadSchemas(bundledSchemaDir())).values()) {
      expect(s.views.length).toBeGreaterThan(0);
      for (const v of s.views) expect(v.name && v.type).toBeTruthy();
    }
  });
});

describe("校验能发现错误", () => {
  const check = (yaml: string) => {
    const a = parseSchema("a", yaml);
    const b = parseSchema("b", "folder: b\nfields:\n  status: { type: status, options: [todo, done] }\n");
    return validateSchemas(new Map([["a", a], ["b", b]]));
  };

  it("关联到不存在的数据库", () => {
    expect(check("fields:\n  x: { type: relation, to: nope }")).toEqual([expect.stringContaining("不存在的数据库 nope")]);
  });

  it("看板按非 select 字段分组", () => {
    const errs = check("fields:\n  t: { type: text }\nviews:\n  - { name: K, type: board, group: t }");
    expect(errs.join()).toContain("看板必须按 select 或 status");
  });

  it("视图引用不存在的字段、within 值无效", () => {
    const errs = check(
      "fields:\n  d: { type: date }\nviews:\n  - name: V\n    type: list\n    filter: [[nope, is, 1], [d, within, next_year]]\n    sort: [-missing]",
    );
    expect(errs.join("\n")).toMatch(/过滤字段 nope/);
    expect(errs.join("\n")).toMatch(/within 的值 next_year/);
    expect(errs.join("\n")).toMatch(/排序字段 -missing/);
  });

  it("progress 的 via 必须是指回本库的关联", () => {
    const errs = check("fields: {}\ncomputed:\n  p: { fn: progress, from: b, via: status }");
    expect(errs.join()).toContain("不是指向 a 的关联");
  });

  it("默认值不在选项里", () => {
    expect(check("fields:\n  s: { type: select, options: [x], default: y }").join()).toContain("默认值 y");
  });
});
