import { Document, isMap, isScalar, parseDocument } from "yaml";

const FM_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const EMPTY_FM_RE = /^\uFEFF?---[ \t]*\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false } as const;

export interface ParsedFile {
  data: Record<string, unknown>;
  body: string;
  /** 原文是否使用 CRLF 换行；写回时保持一致。 */
  crlf: boolean;
  error?: string;
}

function splitRaw(raw: string): { yamlText: string | null; body: string } {
  const empty = EMPTY_FM_RE.exec(raw);
  if (empty) return { yamlText: "", body: raw.slice(empty[0].length) };
  const m = FM_RE.exec(raw);
  if (!m) return { yamlText: null, body: raw.replace(/^\uFEFF/, "") };
  return { yamlText: m[1]!, body: raw.slice(m[0].length) };
}

function parseYaml(text: string): Document {
  // YAML 1.2 core schema：2026-10-17 保持为字符串，不会被转换成带时区的 Date
  return parseDocument(text, { version: "1.2", uniqueKeys: false });
}

export function parseFile(raw: string): ParsedFile {
  const crlf = raw.includes("\r\n");
  const { yamlText, body } = splitRaw(raw);
  const normBody = body.replace(/\r\n/g, "\n").replace(/^\n/, "");
  if (yamlText === null || yamlText.trim() === "") return { data: {}, body: normBody, crlf };
  const doc = parseYaml(yamlText.replace(/\r\n/g, "\n"));
  if (doc.errors.length) return { data: {}, body: normBody, crlf, error: doc.errors[0]!.message };
  const data = doc.toJS();
  if (data == null) return { data: {}, body: normBody, crlf };
  if (typeof data !== "object" || Array.isArray(data)) {
    return { data: {}, body: normBody, crlf, error: "frontmatter 不是键值对" };
  }
  return { data: data as Record<string, unknown>, body: normBody, crlf };
}

/** 「没有值」：写入时删除这个键。checkbox 的 false 也不写入文件。 */
export function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}

function setValue(doc: Document, key: string, value: unknown) {
  if (isBlank(value)) {
    doc.delete(key);
    return;
  }
  const existing = doc.get(key, true);
  if (isScalar(existing) && !Array.isArray(value) && typeof value !== "object") {
    // 原地改值，保留行尾注释
    existing.value = value;
    existing.type = undefined;
    return;
  }
  const node = doc.createNode(value);
  if (Array.isArray(value)) (node as { flow?: boolean }).flow = true;
  doc.set(key, node);
}

function assemble(yamlText: string, body: string, crlf: boolean): string {
  const fm = yamlText.trim() ? `---\n${yamlText.replace(/\n+$/, "")}\n---\n` : "";
  const text = fm + (fm && body ? "\n" : "") + body;
  return crlf ? text.replace(/\r?\n/g, "\r\n") : text;
}

/** 新文件的完整内容。 */
export function serialize(data: Record<string, unknown>, body = ""): string {
  const doc = new Document({});
  for (const [k, v] of Object.entries(data)) setValue(doc, k, v);
  const yamlText = isMap(doc.contents) && doc.contents.items.length ? doc.toString(STRINGIFY) : "";
  return assemble(yamlText, normalizeBody(body), false);
}

function normalizeBody(body: string): string {
  const b = body.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
  return b ? b + "\n" : "";
}

/**
 * 修改已有文件的 frontmatter。只改 patch 里的键，其他键的顺序、注释和格式保持原样。
 * patch 中值为 undefined / null / "" / false / [] 的键会被删除。
 * 传入 body 时同时替换正文。
 */
export function updateRaw(raw: string, patch: Record<string, unknown>, body?: string): string {
  const crlf = raw.includes("\r\n");
  const split = splitRaw(raw);
  const doc = split.yamlText ? parseYaml(split.yamlText.replace(/\r\n/g, "\n")) : new Document({});
  if (doc.errors.length) throw new Error(`frontmatter 解析失败，拒绝修改：${doc.errors[0]!.message}`);
  if (doc.contents == null) doc.contents = doc.createNode({}) as never;
  if (!isMap(doc.contents)) throw new Error("frontmatter 不是键值对，拒绝修改");
  for (const [k, v] of Object.entries(patch)) setValue(doc, k, v);
  const yamlText = doc.contents.items.length ? doc.toString(STRINGIFY) : "";
  const newBody = body === undefined ? split.body.replace(/\r\n/g, "\n").replace(/^\n/, "") : normalizeBody(body);
  return assemble(yamlText, newBody, crlf);
}
