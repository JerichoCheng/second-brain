import { Document, isMap, isSeq, parseDocument, type Node, type YAMLMap, type YAMLSeq } from "yaml";
import type { FilterItem, ViewDef } from "./types.js";

/*
 * 视图写回 schema 文件时直接改原文：只替换 / 插入 / 删除这个视图所在的几行。
 * 用 yaml 库整体重新输出会顺带改掉其他行的空格（`{ type: x }` → `{type: x}`、对齐用的空格），
 * 让 git diff 里出现一堆无关改动。
 */

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false } as const;

/** 视图里各键的固定顺序，和手写的 schema 文件一致。 */
const VIEW_KEYS: (keyof ViewDef)[] = [
  "name", "type", "filter", "sort", "group", "hide", "columns", "date", "cover", "include_archived",
];

/** 去掉空值，按固定顺序排列键。 */
export function cleanView(view: ViewDef): ViewDef {
  const out: Record<string, unknown> = {};
  for (const k of VIEW_KEYS) {
    const v = view[k];
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as unknown as ViewDef;
}

function flow(node: unknown): void {
  if (isSeq(node) || isMap(node)) (node as { flow?: boolean }).flow = true;
}

/** 条件写成 `[status, is, done]`；`any` / `all` 写成 `any: [[...], [...]]`。 */
function styleFilterItem(node: unknown, item: FilterItem): void {
  if (Array.isArray(item)) return flow(node);
  if (isMap(node)) for (const pair of node.items) flow(pair.value);
}

/** 一个视图的 YAML 文本：`- name: ...` 开头，缩进从第 0 列开始，以换行结尾。 */
function viewText(view: ViewDef): string {
  const clean = cleanView(view);
  const doc = new Document([clean]);
  const map = (doc.contents as YAMLSeq).items[0] as YAMLMap;
  for (const pair of map.items) {
    const key = String((pair.key as { value?: unknown }).value);
    if (key === "filter" && isSeq(pair.value)) {
      const items = clean.filter!;
      pair.value.items.forEach((n, i) => styleFilterItem(n, items[i]!));
      // 只有一个简单条件时写在一行：filter: [[status, is, inbox]]
      if (items.length === 1 && Array.isArray(items[0])) flow(pair.value);
    } else {
      flow(pair.value);
    }
  }
  return doc.toString(STRINGIFY);
}

function indent(text: string, col: number): string {
  const pad = " ".repeat(col);
  return text.replace(/^(?=.)/gm, pad);
}

function lineStart(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

interface Located {
  text: string;
  seq: YAMLSeq | null;
}

function locate(raw: string): Located {
  const text = raw.replace(/\r\n/g, "\n");
  const doc = parseDocument(text, { version: "1.2" });
  if (doc.errors.length) throw new Error(`schema 解析失败，拒绝修改：${doc.errors[0]!.message}`);
  if (!isMap(doc.contents)) throw new Error("schema 不是键值对，拒绝修改");
  const views = doc.get("views", true);
  if (views == null) return { text, seq: null };
  if (!isSeq(views)) throw new Error("schema 的 views 不是列表，拒绝修改");
  return { text, seq: views };
}

function finish(text: string, raw: string): string {
  return raw.includes("\r\n") ? text.replace(/\n/g, "\r\n") : text;
}

function itemIndex(seq: YAMLSeq, name: string): number {
  return seq.items.findIndex((n) => isMap(n) && String(n.get("name")) === name);
}

/** 视图在原文中占的范围：从 `-` 所在行的行首，到最后一个值所在行的末尾（含换行）。 */
function itemSpan(text: string, node: Node): [number, number, number] {
  const [start, valueEnd] = node.range!;
  const from = lineStart(text, start);
  const dash = text.indexOf("-", from) - from;
  let end = valueEnd;
  if (text[end - 1] !== "\n") {
    const nl = text.indexOf("\n", end);
    end = nl === -1 ? text.length : nl + 1;
  }
  return [from, end, dash];
}

function withNewline(s: string): string {
  return s === "" || s.endsWith("\n") ? s : s + "\n";
}

/**
 * 在 schema 文件原文中新增或替换一个视图。
 * replace 为已有视图名时原位替换，否则追加到末尾。文件其余部分逐字保留。
 */
export function upsertViewText(raw: string, view: ViewDef, replace?: string): string {
  const { text, seq } = locate(raw);
  const item = viewText(view);

  if (!seq || (seq.flow && seq.items.length === 0)) {
    // 没有 views，或者是 `views: []`
    const body = indent(item, 2);
    if (seq) {
      const [s, e] = seq.range!;
      return finish(text.slice(0, s).replace(/[ \t]+$/, "") + "\n" + body + text.slice(e).replace(/^[ \t]*\n?/, ""), raw);
    }
    return finish(withNewline(text) + "\nviews:\n" + body, raw);
  }
  if (seq.flow) throw new Error("views 写成了单行列表，请改成多行格式后再保存视图");

  const i = replace === undefined ? -1 : itemIndex(seq, replace);
  if (i !== -1) {
    const [from, end, dash] = itemSpan(text, seq.items[i] as Node);
    return finish(text.slice(0, from) + indent(item, dash) + text.slice(end), raw);
  }

  const last = seq.items[seq.items.length - 1] as Node;
  const [, , dash] = itemSpan(text, last);
  const at = seq.range![2];
  const before = withNewline(text.slice(0, at));
  return finish(before + "\n" + indent(item, dash) + text.slice(at), raw);
}

/** 从 schema 文件原文中删除一个视图（连同紧挨在它上方的注释）。 */
export function removeViewText(raw: string, name: string): string {
  const { text, seq } = locate(raw);
  const i = seq ? itemIndex(seq, name) : -1;
  if (!seq || i === -1) return raw;
  const node = seq.items[i] as Node;
  let [from] = itemSpan(text, node);
  const end = node.range![2];
  // 上方紧挨着的注释行属于这个视图
  while (from > 0) {
    const prev = lineStart(text, from - 1);
    if (!/^[ \t]*#/.test(text.slice(prev, from))) break;
    from = prev;
  }
  let left = text.slice(0, from);
  let right = text.slice(end);
  // 视图之间用空行隔开：删掉一个后，不要在开头、结尾或中间留下多余的空行
  if (i === seq.items.length - 1) left = left.replace(/\n+$/, "\n");
  else right = right.replace(/^\n+/, "");
  return finish(left + right, raw);
}
