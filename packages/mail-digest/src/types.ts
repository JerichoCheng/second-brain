export interface Mail {
  account: string;          // 账户 id，如 UWA / Gmail
  id: string;               // 账户内唯一 id
  from: string;             // 发件地址
  fromName: string;
  subject: string;
  date: Date;
  text: string;             // 清洗、截断后的正文
  attachments: string[];
}

export type Category = "action" | "deadline" | "info" | "ignore";

export interface ActionItem {
  title: string;
  due: string | null;       // YYYY-MM-DD
}

export interface Analysis {
  id: string;
  category: Category;
  importance: 1 | 2 | 3;
  summary: string;
  actions: ActionItem[];
  project: string | null;   // vault 里的项目名
  byRule?: boolean;         // 被本地规则过滤，未发送给 API
}

export interface ImapAccount {
  id: string;
  type: "imap";
  host: string;
  port: number;
  user: string;
  passwordEnv: string;
  gmailQuery?: string;
}

export interface GraphAccount {
  id: string;
  type: "graph";
  clientId: string;
  tenant: string;
}

export type Account = ImapAccount | GraphAccount;

export interface Config {
  vaultPath: string;
  dataDir?: string;
  deepseek: { baseUrl: string; model: string; batchSize: number };
  firstRunHours: number;
  maxBodyChars: number;
  accounts: Account[];
  ignore: { senders: string[]; subjects: string[] };
}

export interface AccountState {
  lastRun?: string;         // ISO
  uidValidity?: string;     // IMAP
  lastUid?: number;         // IMAP
}

export type State = Record<string, AccountState>;
