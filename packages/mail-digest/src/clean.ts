import { convert } from "html-to-text";

const QUOTE_MARKERS = [
  /^On .{5,200} wrote:\s*$/m,
  /^在.{2,100}写道[:：]\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*原始邮件\s*-{2,}/m,
  /^From: .+\r?\n(Sent|Date): /m,
  /^发件人[:：].+\r?\n(发送时间|日期)[:：]/m,
];

/** 正文清洗：HTML 转文本、去掉引用的历史回复、压缩空白、截断。 */
export function cleanBody(text: string | undefined, html: string | undefined | false, max: number): string {
  let body = text && text.trim() ? text : html ? convert(html, { wordwrap: false, selectors: [
    { selector: "img", format: "skip" },
    { selector: "a", options: { ignoreHref: true } },
  ] }) : "";
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(body);
    if (m && m.index > 40) body = body.slice(0, m.index);
  }
  body = body
    .split(/\r?\n/)
    .filter((l) => !l.startsWith(">"))
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return body.length > max ? body.slice(0, max) + "\n…（正文已截断）" : body;
}

/** 本地规则：命中的邮件不发给 API，直接归为可忽略。 */
export function matchesIgnore(from: string, subject: string, rules: { senders: string[]; subjects: string[] }): boolean {
  const addr = from.toLowerCase();
  const senderHit = rules.senders.some((p) => {
    const re = new RegExp("^" + p.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return re.test(addr);
  });
  return senderHit || rules.subjects.some((p) => new RegExp(p, "i").test(subject));
}
