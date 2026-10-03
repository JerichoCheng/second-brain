import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { cleanBody } from "../clean.js";
import type { AccountState, ImapAccount, Mail } from "../types.js";

/**
 * 只读抓取 INBOX 新邮件。
 * - 以 EXAMINE（readOnly）打开邮箱，抓取用 BODY.PEEK，不会改变已读状态。
 * - 用 UIDVALIDITY + 最后一个 UID 做增量；首次运行取最近 firstRunHours 小时。
 * - imapflow 连接时会自动发送 IMAP ID，网易 163 要求客户端标识，否则会报 Unsafe Login。
 */
export async function fetchImap(acc: ImapAccount, st: AccountState, since: Date, maxBody: number)
  : Promise<{ mails: Mail[]; state: AccountState }> {
  const pass = process.env[acc.passwordEnv];
  if (!pass) throw new Error(`${acc.id}: 环境变量 ${acc.passwordEnv} 未设置`);
  const client = new ImapFlow({
    host: acc.host, port: acc.port, secure: true,
    auth: { user: acc.user, pass },
    logger: false,
    clientInfo: { name: "second-brain-mail-digest", version: "0.1.0" },
  });
  await client.connect();
  const mails: Mail[] = [];
  const next: AccountState = { ...st };
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const box = client.mailbox;
      if (!box) throw new Error("INBOX 打开失败");
      const validity = String(box.uidValidity);
      const incremental = st.uidValidity === validity && typeof st.lastUid === "number";
      const query: SearchObject = incremental ? { uid: `${st.lastUid! + 1}:*` } : { since };
      if (acc.gmailQuery) query.gmraw = acc.gmailQuery;
      const found = await client.search(query, { uid: true });
      const uids = (found || []).filter((u) => !incremental || u > st.lastUid!);
      let maxUid = incremental ? st.lastUid! : 0;
      if (uids.length) {
        for await (const msg of client.fetch(uids, { uid: true, source: true, internalDate: true }, { uid: true })) {
          maxUid = Math.max(maxUid, msg.uid);
          const when = msg.internalDate ? new Date(msg.internalDate) : new Date();
          if (!incremental && when < since) continue;
          if (!msg.source) continue;
          const p = await simpleParser(msg.source);
          const from = p.from?.value?.[0];
          mails.push({
            account: acc.id,
            id: `${acc.id}:${validity}:${msg.uid}`,
            from: (from?.address || "").toLowerCase(),
            fromName: from?.name || from?.address || "",
            subject: p.subject || "（无主题）",
            date: p.date || when,
            text: cleanBody(p.text, p.html, maxBody),
            attachments: (p.attachments || []).map((a) => a.filename || "附件"),
          });
        }
      } else if (!incremental) {
        // 首次运行没有新邮件：记下当前位置，下次从这里增量
        maxUid = Number(box.uidNext) - 1;
      }
      next.uidValidity = validity;
      next.lastUid = maxUid;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  return { mails, state: next };
}
