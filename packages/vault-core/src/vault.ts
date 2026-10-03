import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { localDate, resolveDate } from "./dates.js";
import { atomicWrite, exists, moveFile, TMP_SUFFIX } from "./fs.js";
import { parseFile, serialize, updateRaw } from "./frontmatter.js";
import { extractLinks, invalidTitle, linkTo, linksInValue, nameKey, relationTargets, replaceLinks } from "./links.js";
import { getValue, runQuery, type IndexLike, type Value } from "./query.js";
import { loadSchemas, rangeStartField, validateSchemas } from "./schema.js";
import type { Entry, QueryContext, QueryResult, Schema, VaultEvent, ViewDef } from "./types.js";

export class VaultError extends Error {}

export interface VaultOptions {
  /** schema 目录，相对 vault 根目录。 */
  schemaDir?: string;
  /** 不建索引的顶层文件夹（模板不算正式条目）。以 `.` 开头的文件夹总是忽略。 */
  ignoreFolders?: string[];
}

export interface CreateOptions {
  fields?: Record<string, unknown>;
  body?: string;
  /** 重名时：报错（默认）或自动加 (2)、(3) 后缀。 */
  onConflict?: "error" | "suffix";
}

const toPosix = (p: string) => p.split(path.sep).join("/");

export class Vault extends EventEmitter<{ event: [VaultEvent] }> implements IndexLike {
  readonly root: string;
  readonly schemaDir: string;
  schemas = new Map<string, Schema>();
  /** schema 自洽性检查发现的问题。 */
  schemaErrors: string[] = [];

  private entries = new Map<string, Entry>();
  /** nameKey → 路径。 */
  private byName = new Map<string, string>();
  /** nameKey → 所有同名文件路径（只有一个时不记录）。 */
  private dupes = new Map<string, Set<string>>();
  /** nameKey → 链接到它的条目路径。 */
  private inbound = new Map<string, Set<string>>();
  private locks = new Map<string, Promise<unknown>>();
  private ignoreFolders: Set<string>;
  private watcher?: FSWatcher;

  private constructor(root: string, opts: VaultOptions) {
    super();
    this.root = path.resolve(root);
    this.schemaDir = opts.schemaDir ?? ".brain/schema";
    this.ignoreFolders = new Set(opts.ignoreFolders ?? ["templates"]);
  }

  static async open(root: string, opts: VaultOptions = {}): Promise<Vault> {
    const v = new Vault(root, opts);
    await v.reloadSchemas();
    await v.scan();
    return v;
  }

  // ---------------------------------------------------------------- 路径

  private abs(rel: string) {
    return path.join(this.root, ...rel.split("/"));
  }

  private rel(abs: string) {
    return toPosix(path.relative(this.root, abs));
  }

  /** 这个相对路径是否应该进索引。 */
  isIndexed(rel: string): boolean {
    if (!rel.endsWith(".md") || rel.endsWith(TMP_SUFFIX)) return false;
    const parts = rel.split("/");
    if (parts.some((p) => p.startsWith(".") || p === "node_modules")) return false;
    return !this.ignoreFolders.has(parts[0]!);
  }

  /** 按所在文件夹判断属于哪个数据库（取最长匹配，子文件夹也算）。 */
  dbOf(rel: string): string | null {
    let best: Schema | null = null;
    for (const s of this.schemas.values()) {
      if (rel.startsWith(s.folder + "/") && (!best || s.folder.length > best.folder.length)) best = s;
    }
    return best?.id ?? null;
  }

  // ---------------------------------------------------------------- 加载

  async reloadSchemas(): Promise<void> {
    this.schemas = await loadSchemas(this.abs(this.schemaDir));
    this.schemaErrors = validateSchemas(this.schemas);
    // 数据库归属和关联字段都依赖 schema，用缓存的原文重建
    for (const e of [...this.entries.values()]) this.ingest(e.path, e.raw, e.mtimeMs);
  }

  async scan(): Promise<void> {
    this.entries.clear();
    this.byName.clear();
    this.dupes.clear();
    this.inbound.clear();
    const walk = async (dir: string): Promise<void> => {
      let items;
      try {
        items = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      await Promise.all(
        items.map(async (it) => {
          const abs = path.join(dir, it.name);
          const rel = this.rel(abs);
          if (it.isDirectory()) {
            if (!it.name.startsWith(".") && it.name !== "node_modules" && !this.ignoreFolders.has(rel)) await walk(abs);
          } else if (it.isFile() && this.isIndexed(rel)) {
            await this.load(rel);
          }
        }),
      );
    };
    await walk(this.root);
  }

  private async load(rel: string): Promise<Entry | undefined> {
    try {
      const abs = this.abs(rel);
      const [raw, st] = await Promise.all([fs.readFile(abs, "utf8"), fs.stat(abs)]);
      return this.ingest(rel, raw, st.mtimeMs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }

  /** 把一个文件的内容放进索引（替换旧的）。 */
  private ingest(rel: string, raw: string, mtimeMs: number): Entry {
    this.drop(rel);
    const parsed = parseFile(raw);
    const db = this.dbOf(rel);
    const schema = db ? this.schemas.get(db) : undefined;
    const fieldLinks: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      const links = schema?.fields[k]?.type === "relation" ? relationTargets(v) : linksInValue(v);
      if (links.length) fieldLinks[k] = links;
    }
    const entry: Entry = {
      path: rel,
      name: path.posix.basename(rel, ".md"),
      db,
      data: parsed.data,
      body: parsed.body,
      raw,
      mtimeMs,
      fieldLinks,
      bodyLinks: extractLinks(parsed.body),
      ...(parsed.error ? { error: parsed.error } : {}),
    };
    this.entries.set(rel, entry);

    const key = nameKey(entry.name);
    const holder = this.byName.get(key);
    if (holder === undefined) this.byName.set(key, rel);
    else {
      const set = this.dupes.get(key) ?? new Set([holder]);
      set.add(rel);
      this.dupes.set(key, set);
    }
    for (const target of this.outLinks(entry)) {
      const t = nameKey(target);
      if (!this.inbound.has(t)) this.inbound.set(t, new Set());
      this.inbound.get(t)!.add(rel);
    }
    return entry;
  }

  private outLinks(e: Entry): Set<string> {
    return new Set([...Object.values(e.fieldLinks).flat(), ...e.bodyLinks]);
  }

  private drop(rel: string): void {
    const old = this.entries.get(rel);
    if (!old) return;
    this.entries.delete(rel);
    const key = nameKey(old.name);
    const dup = this.dupes.get(key);
    if (dup) {
      dup.delete(rel);
      if (this.byName.get(key) === rel) this.byName.set(key, [...dup][0]!);
      if (dup.size <= 1) this.dupes.delete(key);
    } else if (this.byName.get(key) === rel) {
      this.byName.delete(key);
    }
    for (const target of this.outLinks(old)) {
      const set = this.inbound.get(nameKey(target));
      set?.delete(rel);
      if (set && !set.size) this.inbound.delete(nameKey(target));
    }
  }

  // ---------------------------------------------------------------- 读取

  all(): Entry[] {
    return [...this.entries.values()];
  }

  entriesOf(db: string): Entry[] {
    return this.all().filter((e) => e.db === db);
  }

  /** 按名字找条目（不区分大小写）。 */
  resolve(name: string): Entry | undefined {
    const p = this.byName.get(nameKey(name));
    return p ? this.entries.get(p) : undefined;
  }

  /** 按路径或名字取条目。 */
  get(pathOrName: string): Entry | undefined {
    return this.entries.get(pathOrName) ?? this.resolve(pathOrName.replace(/\.md$/, ""));
  }

  /** 所有链接到 name 的条目（frontmatter 或正文）。 */
  backlinks(name: string): Entry[] {
    return [...(this.inbound.get(nameKey(name)) ?? [])].map((p) => this.entries.get(p)!);
  }

  referrers(name: string, db: string, via: string): Entry[] {
    const key = nameKey(name);
    return this.backlinks(name).filter((e) => e.db === db && (e.fieldLinks[via] ?? []).some((l) => nameKey(l) === key));
  }

  /** 指向不存在页面的链接。 */
  danglingLinks(): { from: string; target: string }[] {
    const out: { from: string; target: string }[] = [];
    for (const [key, set] of this.inbound) {
      if (this.byName.has(key)) continue;
      for (const from of set) {
        const e = this.entries.get(from)!;
        const target = [...this.outLinks(e)].find((t) => nameKey(t) === key)!;
        out.push({ from, target });
      }
    }
    return out;
  }

  /** 重名的文件（名字不区分大小写）。正常情况下应为空。 */
  conflicts(): string[][] {
    return [...this.dupes.values()].map((s) => [...s].sort());
  }

  schemaOf(db: string): Schema {
    const s = this.schemas.get(db);
    if (!s) throw new VaultError(`数据库 ${db} 不存在`);
    return s;
  }

  /** 字段值（已按类型规整，含计算字段）。 */
  value(entry: Entry, field: string, ctx: QueryContext = {}): Value {
    if (!entry.db) return (entry.data[field] ?? null) as Value;
    return getValue(this, this.schemaOf(entry.db), entry, field, ctx);
  }

  /** view 可以是 schema 中的视图名，也可以是临时的视图定义。 */
  query(db: string, view: string | ViewDef, ctx: QueryContext = {}): QueryResult {
    const schema = this.schemaOf(db);
    const v = typeof view === "string" ? schema.views.find((x) => x.name === view) : view;
    if (!v) throw new VaultError(`${db} 中没有视图「${view}」`);
    return runQuery(this, schema, v, ctx);
  }

  // ---------------------------------------------------------------- 写入

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(key, next.catch(() => {}));
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }

  private async write(rel: string, content: string): Promise<Entry> {
    const abs = this.abs(rel);
    await atomicWrite(abs, content);
    const st = await fs.stat(abs);
    return this.ingest(rel, content, st.mtimeMs);
  }

  /** 按 schema 检查并规整要写入的字段值。 */
  normalizePatch(db: string | null, patch: Record<string, unknown>): Record<string, unknown> {
    if (!db) return patch;
    const schema = this.schemaOf(db);
    const starts = new Set(Object.values(schema.fields).map(rangeStartField).filter(Boolean));
    const out: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (schema.computed[k]) {
        errors.push(`${k} 是计算字段，不能写入`);
        continue;
      }
      const def = schema.fields[k] ?? (starts.has(k) ? { type: "date" as const } : undefined);
      if (!def || v === undefined || v === null || v === "") {
        out[k] = v;
        continue;
      }
      const bad = (why: string) => errors.push(`${k}: ${why}`);
      switch (def.type) {
        case "select":
        case "status":
          if (def.options?.length && !def.options.includes(String(v))) bad(`"${v}" 不在选项 ${def.options.join(" / ")} 中`);
          out[k] = String(v);
          break;
        case "multi_select": {
          const arr = (Array.isArray(v) ? v : [v]).map(String);
          const unknown = def.options?.length ? arr.filter((x) => !def.options!.includes(x)) : [];
          if (unknown.length) bad(`"${unknown.join(", ")}" 不在选项中`);
          out[k] = arr;
          break;
        }
        case "date": {
          const d = resolveDate(v, {});
          if (!d) bad(`"${v}" 不是 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm`);
          out[k] = d;
          break;
        }
        case "number": {
          const n = typeof v === "number" ? v : Number(v);
          if (!Number.isFinite(n)) bad(`"${v}" 不是数字`);
          out[k] = n;
          break;
        }
        case "checkbox":
          if (typeof v !== "boolean") bad("应为 true 或 false");
          out[k] = v === true;
          break;
        case "relation": {
          const names = relationTargets(v);
          if (!def.multiple && names.length > 1) bad("只能关联一个条目");
          const links = names.map(linkTo);
          out[k] = def.multiple ? links : links[0];
          break;
        }
        default:
          out[k] = String(v);
      }
    }
    if (errors.length) throw new VaultError(errors.join("；"));
    return out;
  }

  private uniqueName(title: string, onConflict: "error" | "suffix", except?: string): string {
    const taken = (n: string) => {
      const p = this.byName.get(nameKey(n));
      return p !== undefined && p !== except;
    };
    if (!taken(title)) return title;
    if (onConflict === "error") throw new VaultError(`已经有名为「${title}」的页面`);
    for (let i = 2; ; i++) if (!taken(`${title} (${i})`)) return `${title} (${i})`;
  }

  private async template(schema: Schema, title: string): Promise<{ data: Record<string, unknown>; body: string }> {
    if (!schema.template) return { data: {}, body: "" };
    const file = this.abs(schema.template);
    if (!(await exists(file))) return { data: {}, body: "" };
    const fill = (s: string) => s.replaceAll("{{title}}", title).replaceAll("{{date}}", localDate(new Date()));
    const t = parseFile(fill(await fs.readFile(file, "utf8")));
    return { data: t.data, body: t.body };
  }

  /** 在数据库中新建条目：schema 默认值 → 模板 → 传入的字段，后者覆盖前者。 */
  async create(db: string, title: string, opts: CreateOptions = {}): Promise<Entry> {
    const schema = this.schemaOf(db);
    const why = invalidTitle(title);
    if (why) throw new VaultError(why);
    const name = this.uniqueName(title.trim(), opts.onConflict ?? "error");
    const tpl = await this.template(schema, name);
    const defaults: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(schema.fields)) {
      if (f.default !== undefined && !(k in tpl.data)) defaults[k] = f.default;
    }
    const data = { ...this.normalizePatch(db, defaults), ...tpl.data, ...this.normalizePatch(db, opts.fields ?? {}) };
    const rel = `${schema.folder}/${name}.md`;
    return this.withLock(nameKey(name), () => this.write(rel, serialize(data, opts.body ?? tpl.body)));
  }

  /**
   * 修改字段（只改 patch 中的键，值为空则删除该键），可选同时替换正文。
   * 以磁盘上的最新内容为准，不会覆盖外部编辑器刚做的修改。
   */
  async update(target: string, patch: Record<string, unknown>, body?: string): Promise<Entry> {
    const e = this.mustGet(target);
    const normalized = this.normalizePatch(e.db, patch);
    return this.withLock(nameKey(e.name), async () => {
      const raw = await fs.readFile(this.abs(e.path), "utf8");
      return this.write(e.path, updateRaw(raw, normalized, body));
    });
  }

  /**
   * 重命名页面，并把全库所有指向它的链接（frontmatter 和正文）改成新名字。
   * 返回被修改了链接的文件。
   */
  async rename(target: string, newTitle: string): Promise<{ entry: Entry; updated: string[] }> {
    const e = this.mustGet(target);
    const why = invalidTitle(newTitle);
    if (why) throw new VaultError(why);
    const title = newTitle.trim();
    this.uniqueName(title, "error", e.path);
    const oldName = e.name;
    const updated: string[] = [];
    for (const ref of this.backlinks(oldName)) {
      if (ref.path === e.path) continue;
      await this.withLock(nameKey(ref.name), async () => {
        const raw = await fs.readFile(this.abs(ref.path), "utf8");
        const next = replaceLinks(raw, oldName, title);
        if (next !== raw) {
          await this.write(ref.path, next);
          updated.push(ref.path);
        }
      });
    }
    const newRel = path.posix.join(path.posix.dirname(e.path), `${title}.md`);
    const entry = await this.withLock(nameKey(oldName), async () => {
      const raw = await fs.readFile(this.abs(e.path), "utf8");
      const self = replaceLinks(raw, oldName, title); // 页面里指向自己的链接
      await moveFile(this.abs(e.path), this.abs(newRel));
      this.drop(e.path);
      if (self !== raw) return this.write(newRel, self);
      const st = await fs.stat(this.abs(newRel));
      return this.ingest(newRel, raw, st.mtimeMs);
    });
    return { entry, updated };
  }

  /** 删除条目：移到 .brain/trash/，不是永久删除。 */
  async remove(target: string): Promise<string> {
    const e = this.mustGet(target);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const trashRel = `.brain/trash/${stamp} ${e.name}.md`;
    await this.withLock(nameKey(e.name), async () => {
      await moveFile(this.abs(e.path), this.abs(trashRel));
      this.drop(e.path);
    });
    return trashRel;
  }

  private mustGet(target: string): Entry {
    const e = this.get(target);
    if (!e) throw new VaultError(`找不到页面「${target}」`);
    return e;
  }

  // ---------------------------------------------------------------- 监听

  /** 监听外部修改（其他编辑器、agent 写入 inbox、git pull 等），通过 'event' 事件通知。 */
  async watch(): Promise<void> {
    if (this.watcher) return;
    const schemaPrefix = this.schemaDir + "/";
    const relevant = (rel: string) => this.isIndexed(rel) || (rel.startsWith(schemaPrefix) && /\.ya?ml$/.test(rel));
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
      ignored: (abs, stats) => {
        const rel = this.rel(abs);
        if (!rel || rel === ".brain" || rel === this.schemaDir) return false;
        if (rel.startsWith(schemaPrefix)) return false;
        const parts = rel.split("/");
        if (parts.some((p) => p.startsWith(".") || p === "node_modules")) return true;
        if (this.ignoreFolders.has(parts[0]!)) return true;
        return stats?.isFile() === true && !rel.endsWith(".md");
      },
    });
    const onFile = async (abs: string) => {
      const rel = this.rel(abs);
      if (!relevant(rel)) return;
      if (rel.startsWith(schemaPrefix)) {
        await this.reloadSchemas();
        this.emit("event", { type: "schema" });
        return;
      }
      const raw = await fs.readFile(abs, "utf8").catch(() => null);
      if (raw === null) return;
      const old = this.entries.get(rel);
      if (old?.raw === raw) return; // 自己刚写的，索引已是最新
      const st = await fs.stat(abs);
      const entry = this.ingest(rel, raw, st.mtimeMs);
      this.emit("event", { type: old ? "change" : "add", path: rel, entry });
    };
    const onUnlink = async (abs: string) => {
      const rel = this.rel(abs);
      if (rel.startsWith(schemaPrefix)) {
        await this.reloadSchemas();
        this.emit("event", { type: "schema" });
        return;
      }
      if (!this.entries.has(rel)) return;
      this.drop(rel);
      this.emit("event", { type: "unlink", path: rel });
    };
    this.watcher.on("add", onFile).on("change", onFile).on("unlink", onUnlink);
    await new Promise<void>((resolve) => this.watcher!.once("ready", () => resolve()));
  }

  async close(): Promise<void> {
    await this.watcher?.close();
    this.watcher = undefined;
  }
}
