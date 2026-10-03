import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { simpleParser } from "mailparser";
import { analyze, mockAnalyze } from "./analyze.js";
import { cleanBody, matchesIgnore } from "./clean.js";
import { fetchGraph } from "./providers/graph.js";
import { fetchImap } from "./providers/imap.js";
import type { Analysis, Config, Mail, State } from "./types.js";
import { loadProjects, writeDigest, writeProposals } from "./vault.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const MOCK = args.has("--mock"), DRY = args.has("--dry-run"), LOGIN = args.has("--login");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

async function loadFixtures(maxBody: number): Promise<Mail[]> {
  const dir = path.join(ROOT, "fixtures");
  const out: Mail[] = [];
  for (const f of (await fs.readdir(dir)).filter((x) => x.endsWith(".eml")).sort()) {
    const p = await simpleParser(await fs.readFile(path.join(dir, f)));
    const from = p.from?.value?.[0];
    out.push({
      account: "Mock", id: `Mock:${f}`, from: (from?.address || "").toLowerCase(),
      fromName: from?.name || "", subject: p.subject || "", date: p.date || new Date(),
      text: cleanBody(p.text, p.html, maxBody), attachments: (p.attachments || []).map((a) => a.filename || "附件"),
    });
  }
  return out;
}

async function main() {
  const cfgFile = path.join(ROOT, MOCK ? "config.example.json" : "config.json");
  const cfg = await readJson<Config | null>(cfgFile, null);
  if (!cfg) throw new Error(`找不到 ${cfgFile}，请从 config.example.json 复制一份`);
  if (MOCK) cfg.vaultPath = process.env.MOCK_VAULT || path.join(ROOT, "mock-vault");
  const dataDir = cfg.dataDir || path.join(os.homedir(), ".second-brain", "mail-digest");
  const stateFile = path.join(dataDir, "state.json");
  const state = await readJson<State>(stateFile, {});
  const since = new Date(Date.now() - cfg.firstRunHours * 3600_000);
  const today = new Date().toLocaleDateString("sv-SE");

  // 1. 抓取
  const mails: Mail[] = [];
  const newState: State = { ...state };
  if (MOCK) {
    mails.push(...(await loadFixtures(cfg.maxBodyChars)));
  } else {
    for (const acc of cfg.accounts) {
      try {
        const st = state[acc.id] ?? {};
        const r = acc.type === "imap"
          ? await fetchImap(acc, st, since, cfg.maxBodyChars)
          : await fetchGraph(acc, st, since, cfg.maxBodyChars, dataDir, LOGIN);
        mails.push(...r.mails);
        newState[acc.id] = { ...r.state, lastRun: r.state.lastRun ?? new Date().toISOString() };
        console.log(`${acc.id}: ${r.mails.length} 封新邮件`);
      } catch (e) {
        console.error(`${acc.id}: 抓取失败，本次跳过 —— ${(e as Error).message}`);
      }
    }
  }
  if (LOGIN) { await fs.mkdir(dataDir, { recursive: true }); console.log("登录完成"); }
  if (!mails.length) {
    console.log("没有新邮件");
    if (!DRY && !MOCK) await saveState(stateFile, newState);
    return;
  }

  // 2. 本地规则过滤
  const ruled: Analysis[] = [];
  const toModel: Mail[] = [];
  for (const m of mails) {
    if (matchesIgnore(m.from, m.subject, cfg.ignore)) {
      ruled.push({ id: m.id, category: "ignore", importance: 1, summary: "", actions: [], project: null, byRule: true });
    } else toModel.push(m);
  }

  // 3. 模型分析
  const projects = await loadProjects(cfg.vaultPath);
  let analyses: Analysis[];
  if (MOCK) analyses = mockAnalyze(toModel, projects);
  else {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error("DEEPSEEK_API_KEY 未设置");
    analyses = toModel.length ? await analyze(toModel, projects, cfg, key, today) : [];
  }
  analyses.push(...ruled);

  if (DRY) {
    for (const a of analyses) {
      const m = mails.find((x) => x.id === a.id)!;
      console.log(`[${a.category}/${a.importance}] ${m.subject} → ${a.summary}`, a.actions, a.project ?? "");
    }
    return;
  }

  // 4. 写入 vault：日报 + 任务提案。写成功后才推进抓取进度
  const digest = await writeDigest(cfg.vaultPath, today, mails, analyses);
  const n = await writeProposals(cfg.vaultPath, today, digest, mails, analyses);
  console.log(`已写入 mail/${digest}.md，生成 ${n} 条任务提案`);
  if (!MOCK) await saveState(stateFile, newState);
}

async function saveState(file: string, s: State) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(s, null, 2));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
