import fs from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import type { Analysis, Mail } from "./types.js";

function frontmatter(text: string): Record<string, any> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  try { return (load(m[1]) as Record<string, any>) || {}; } catch { return {}; }
}

/** 与 notion2vault 一致的 YAML 风格：日期不加引号，含特殊字符的字符串用 JSON 引号。 */
function scalar(v: unknown): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s)) return s;
  const plain = /^[^\s:#[\]{},&*!|>'"%@`\-?][^:#\n]*$/.test(s) && !s.endsWith(" ")
    && !/^(yes|no|true|false|null|on|off|~)$/i.test(s) && isNaN(Number(s));
  return plain ? s : JSON.stringify(s);
}

function toYaml(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(scalar).join(", ")}]` : scalar(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "未命名";
}

/** 进行中的项目（未完成、未归档）作为邮件关联的候选。 */
export async function loadProjects(vault: string): Promise<string[]> {
  const dir = path.join(vault, "projects");
  let files: string[] = [];
  try { files = await fs.readdir(dir); } catch { return []; }
  const out: string[] = [];
  for (const f of files.filter((x) => x.endsWith(".md"))) {
    const fm = frontmatter(await fs.readFile(path.join(dir, f), "utf8"));
    if (fm.archived === true || fm.status === "done") continue;
    out.push(f.slice(0, -3));
  }
  return out.sort();
}

const SECTIONS: [string, (a: Analysis) => boolean][] = [
  ["需要处理", (a) => a.category === "action"],
  ["有截止日期", (a) => a.category === "deadline"],
  ["仅供参考", (a) => a.category === "info"],
];

function hhmm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** 写入 mail/<日期> 邮件日报.md；同一天多次运行时追加到同一个文件。返回文件名（不含扩展名）。 */
export async function writeDigest(vault: string, today: string, mails: Mail[], analyses: Analysis[]): Promise<string> {
  const byId = new Map(mails.map((m) => [m.id, m]));
  const name = `${today} 邮件日报`;
  const file = path.join(vault, "mail", `${name}.md`);
  const actions = analyses.reduce((n, a) => n + (a.category === "ignore" ? 0 : a.actions.length), 0);
  const lines: string[] = [];
  for (const [title, pick] of SECTIONS) {
    const items = analyses.filter(pick).sort((a, b) => b.importance - a.importance);
    if (!items.length) continue;
    lines.push(`## ${title}`, "");
    for (const a of items) {
      const m = byId.get(a.id)!;
      const due = a.actions.map((x) => x.due).filter(Boolean).sort()[0];
      const flag = a.importance === 3 ? "🔴 " : "";
      lines.push(`- ${flag}**${m.subject}** · ${m.fromName || m.from}（${m.account}）${due ? ` · 截止 ${due}` : ""}`);
      lines.push(`  ${a.summary}`);
      const extra = [a.project ? `关联 [[${a.project}]]` : "", a.actions.length ? `任务提案 ${a.actions.length} 条` : "",
        m.attachments.length ? `附件：${m.attachments.join("、")}` : ""].filter(Boolean);
      if (extra.length) lines.push(`  ${extra.join(" · ")}`);
    }
    lines.push("");
  }
  const ignored = analyses.filter((a) => a.category === "ignore");
  if (ignored.length) {
    lines.push(`## 已忽略（${ignored.length} 封）`, "");
    for (const a of ignored) {
      const m = byId.get(a.id)!;
      lines.push(`- ${m.fromName || m.from} · ${m.subject}${a.byRule ? "（本地规则）" : ""}`);
    }
    lines.push("");
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  let exists = true;
  try { await fs.access(file); } catch { exists = false; }
  if (!exists) {
    const head = toYaml({ type: "mail-digest", date: today }) + `\n# ${today} 邮件日报\n\n`;
    const summary = `共 ${mails.length} 封，${actions} 条待办提案（${hhmm(new Date())} 生成）\n\n`;
    await fs.writeFile(file, head + summary + lines.join("\n"));
  } else {
    await fs.appendFile(file, `\n---\n\n# ${hhmm(new Date())} 追加：${mails.length} 封\n\n` + lines.join("\n"));
  }
  return name;
}

/**
 * 每条行动项生成一个 inbox 提案。提案的 frontmatter = 目标任务的 frontmatter + proposal_* 字段，
 * 审批通过时去掉 proposal_* 字段、写入 proposal_target 即可。
 */
export async function writeProposals(vault: string, today: string, digestName: string,
  mails: Mail[], analyses: Analysis[]): Promise<number> {
  const byId = new Map(mails.map((m) => [m.id, m]));
  const dir = path.join(vault, "inbox");
  await fs.mkdir(dir, { recursive: true });
  let n = 0;
  for (const a of analyses) {
    if (a.category === "ignore") continue;
    const m = byId.get(a.id)!;
    for (const act of a.actions) {
      const title = safeName(act.title);
      let file = path.join(dir, `${today} ${title}.md`);
      for (let i = 2; await fs.access(file).then(() => true, () => false); i++) {
        file = path.join(dir, `${today} ${title} (${i}).md`);
      }
      const fm = toYaml({
        type: "task",
        status: "next",
        priority: a.importance === 3 ? "high" : "medium",
        due: act.due,
        project: a.project ? `[[${a.project}]]` : null,
        proposal_action: "create",
        proposal_target: `tasks/${title}.md`,
        proposal_source: `[[${digestName}]]`,
        proposal_created: new Date().toISOString().slice(0, 16),
      });
      const body = `\n来自邮件：**${m.subject}** · ${m.fromName || m.from}（${m.account}，${m.date.toLocaleDateString("sv-SE")}）\n\n${a.summary}\n`;
      await fs.writeFile(file, fm + body);
      n++;
    }
  }
  return n;
}
