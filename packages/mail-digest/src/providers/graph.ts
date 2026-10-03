import fs from "node:fs/promises";
import path from "node:path";
import { PublicClientApplication, type ICachePlugin } from "@azure/msal-node";
import { cleanBody } from "../clean.js";
import type { AccountState, GraphAccount, Mail } from "../types.js";

const SCOPES = ["Mail.Read"];

function cachePlugin(file: string): ICachePlugin {
  return {
    async beforeCacheAccess(ctx) {
      try { ctx.tokenCache.deserialize(await fs.readFile(file, "utf8")); } catch { /* 首次没有缓存 */ }
    },
    async afterCacheAccess(ctx) {
      if (ctx.cacheHasChanged) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, ctx.tokenCache.serialize(), { mode: 0o600 });
      }
    },
  };
}

async function getToken(acc: GraphAccount, dataDir: string, interactive: boolean): Promise<string> {
  const pca = new PublicClientApplication({
    auth: { clientId: acc.clientId, authority: `https://login.microsoftonline.com/${acc.tenant}` },
    cache: { cachePlugin: cachePlugin(path.join(dataDir, `msal-${acc.id}.json`)) },
  });
  const [account] = await pca.getTokenCache().getAllAccounts();
  if (account) {
    try {
      return (await pca.acquireTokenSilent({ account, scopes: SCOPES })).accessToken;
    } catch { /* 刷新令牌过期，需重新登录 */ }
  }
  if (!interactive) throw new Error(`${acc.id}: 需要登录，请先运行 npm run login`);
  const res = await pca.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback: (r) => console.log(`\n[${acc.id}] ${r.message}\n`),
  });
  if (!res) throw new Error(`${acc.id}: 登录失败`);
  return res.accessToken;
}

/** 通过 Microsoft Graph 只读获取收件箱新邮件（委托权限 Mail.Read）。 */
export async function fetchGraph(acc: GraphAccount, st: AccountState, since: Date, maxBody: number,
  dataDir: string, interactive: boolean): Promise<{ mails: Mail[]; state: AccountState }> {
  const token = await getToken(acc, dataDir, interactive);
  const from = st.lastRun ? new Date(st.lastRun) : since;
  const params = new URLSearchParams({
    $filter: `receivedDateTime gt ${from.toISOString()}`,
    $orderby: "receivedDateTime asc",
    $top: "50",
    $select: "id,subject,from,receivedDateTime,body,hasAttachments",
  });
  let url: string | undefined = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${params}`;
  const mails: Mail[] = [];
  let latest = from;
  while (url) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!r.ok) throw new Error(`${acc.id}: Graph ${r.status} ${await r.text()}`);
    const data: any = await r.json();
    for (const m of data.value) {
      const when = new Date(m.receivedDateTime);
      if (when > latest) latest = when;
      mails.push({
        account: acc.id,
        id: `${acc.id}:${m.id}`,
        from: (m.from?.emailAddress?.address || "").toLowerCase(),
        fromName: m.from?.emailAddress?.name || "",
        subject: m.subject || "（无主题）",
        date: when,
        text: cleanBody(m.body?.content, undefined, maxBody),
        attachments: m.hasAttachments ? ["（有附件）"] : [],
      });
    }
    url = data["@odata.nextLink"];
  }
  return { mails, state: { ...st, lastRun: latest.toISOString() } };
}
