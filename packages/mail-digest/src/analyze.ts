import type { Analysis, Category, Config, Mail } from "./types.js";

const CATEGORIES: Category[] = ["action", "deadline", "info", "ignore"];

function systemPrompt(today: string, projects: string[]): string {
  return `你是用户的邮件助理。用户是西澳大学（UWA）计算机专业本科生，所在时区 Australia/Perth，今天是 ${today}。
逐封分析给你的邮件，只输出一个 JSON 对象：{"items": [...]}，每封邮件对应一项，字段如下：
- id：原样返回邮件的 id
- category：
  - "action"：需要用户亲自回复、提交、报名、付款、确认等
  - "deadline"：包含与用户相关的截止日期或时间点（考试、作业、活动、缴费），即使暂时不用做什么
  - "info"：值得知道但无需行动（课程公告、成绩已发布、通知）
  - "ignore"：营销、订阅、系统自动通知、与用户无关的群发
- importance：1 低 / 2 中 / 3 高（影响成绩、钱、签证、截止在 3 天内的为 3）
- summary：一句中文摘要，说清楚"谁、要什么、什么时候"，不超过 60 字
- actions：用户需要做的事情数组，每项 {"title": 简短动宾短语（中文，保留课程代码等原文专有名词）, "due": "YYYY-MM-DD" 或 null}。
  邮件里的相对日期（如"本周五"）要结合邮件日期换算成绝对日期。info 和 ignore 类通常为空数组。
- project：从下列项目名中选出最相关的一个并原样返回，没有相关的返回 null：
${projects.length ? projects.map((p) => `  - ${p}`).join("\n") : "  （暂无项目）"}
不要编造邮件中没有的信息。`;
}

function validate(raw: any, ids: Set<string>, projects: Set<string>): Analysis | null {
  if (!raw || !ids.has(raw.id)) return null;
  const category: Category = CATEGORIES.includes(raw.category) ? raw.category : "info";
  const imp = Number(raw.importance);
  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  return {
    id: raw.id,
    category,
    importance: (imp >= 1 && imp <= 3 ? Math.round(imp) : 2) as 1 | 2 | 3,
    summary: String(raw.summary || "").slice(0, 200),
    actions: actions
      .filter((a: any) => a && a.title)
      .map((a: any) => ({
        title: String(a.title).slice(0, 80),
        due: typeof a.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : null,
      })),
    project: projects.has(raw.project) ? raw.project : null,
  };
}

async function callDeepSeek(cfg: Config, apiKey: string, system: string, user: string): Promise<any> {
  const r = await fetch(`${cfg.deepseek.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: cfg.deepseek.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${await r.text()}`);
  const data: any = await r.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
}

/** 分批调用 DeepSeek；解析失败重试一次，仍失败则抛错（本次运行不推进抓取进度，下次重试）。 */
export async function analyze(mails: Mail[], projects: string[], cfg: Config, apiKey: string, today: string)
  : Promise<Analysis[]> {
  const out: Analysis[] = [];
  const system = systemPrompt(today, projects);
  const projectSet = new Set(projects);
  for (let i = 0; i < mails.length; i += cfg.deepseek.batchSize) {
    const batch = mails.slice(i, i + cfg.deepseek.batchSize);
    const ids = new Set(batch.map((m) => m.id));
    const user = JSON.stringify(batch.map((m) => ({
      id: m.id, account: m.account, from: `${m.fromName} <${m.from}>`, subject: m.subject,
      date: m.date.toISOString(), attachments: m.attachments, body: m.text,
    })));
    let parsed: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { parsed = await callDeepSeek(cfg, apiKey, system, user); break; }
      catch (e) { if (attempt === 1) throw e; }
    }
    const got = new Map<string, Analysis>();
    for (const item of parsed?.items ?? []) {
      const a = validate(item, ids, projectSet);
      if (a) got.set(a.id, a);
    }
    for (const m of batch) {
      out.push(got.get(m.id) ?? {
        id: m.id, category: "info", importance: 2, summary: "（模型没有返回这封邮件的分析，请手动查看）",
        actions: [], project: null,
      });
    }
  }
  return out;
}

/** --mock 用的离线分析器：按关键词粗分，只用来检查流程和输出格式。 */
export function mockAnalyze(mails: Mail[], projects: string[]): Analysis[] {
  return mails.map((m) => {
    const t = `${m.subject}\n${m.text}`;
    const date = /(\d{4}-\d{2}-\d{2})/.exec(t)?.[1] ?? null;
    const project = projects.find((p) => {
      const code = /^[A-Z]{4}\d{4}/.exec(p)?.[0];
      return code ? t.includes(code) : false;
    }) ?? null;
    const isAction = /submit|reply|register|提交|回复|报名|confirm/i.test(t);
    const isDeadline = !!date || /due|deadline|截止/i.test(t);
    const category: Category = isAction ? "action" : isDeadline ? "deadline" : /sale|offer|折扣/i.test(t) ? "ignore" : "info";
    return {
      id: m.id, category, importance: isAction ? 3 : 2,
      summary: `${m.fromName}：${m.subject}`,
      actions: category === "action" || category === "deadline" ? [{ title: m.subject.slice(0, 40), due: date }] : [],
      project,
    };
  });
}
