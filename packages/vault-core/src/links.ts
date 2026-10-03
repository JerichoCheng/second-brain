/** [[名字]]、[[名字|别名]]、[[名字#标题]]、![[名字]] */
const LINK_RE = /(!?)\[\[([^[\]|#\n]+)(#[^[\]|\n]*)?(\|[^[\]\n]*)?\]\]/g;

/** 代码块和行内代码，里面的 [[...]] 不算链接。 */
const CODE_RE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/;

/** 名字比较用的键：不区分大小写（Windows 文件名也不区分）。 */
export function nameKey(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}

export function linkTo(name: string): string {
  return `[[${name}]]`;
}

/** 在非代码片段上执行 fn，代码片段原样保留。 */
function outsideCode(text: string, fn: (s: string) => string): string {
  return text
    .split(CODE_RE)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

export function extractLinks(text: string): string[] {
  const out: string[] = [];
  outsideCode(text, (s) => {
    for (const m of s.matchAll(LINK_RE)) out.push(m[2]!.trim());
    return s;
  });
  return out;
}

/**
 * 从关联字段的值中取出页面名。
 * 接受 "[[X]]"、"[[X|别名]]"、纯文本 "X"，以及手写 YAML 时忘了加引号
 * 导致 [[X]] 被解析成的嵌套数组 [["X"]]。
 */
export function relationTargets(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    // [["X"]]：未加引号的 [[X]]
    if (value.length === 1 && Array.isArray(value[0]) && value[0].length === 1 && typeof value[0][0] === "string") {
      return [value[0][0].trim()];
    }
    return value.flatMap(relationTargets);
  }
  if (typeof value !== "string") return [];
  const links = extractLinks(value);
  if (links.length) return links;
  const s = value.trim();
  return s ? [s] : [];
}

/** 只认 [[...]] 形式（用于非 relation 字段里顺带写的链接）。 */
export function linksInValue(value: unknown): string[] {
  if (typeof value === "string") return extractLinks(value);
  if (Array.isArray(value)) return value.flatMap(linksInValue);
  return [];
}

/** 把文本中指向 oldName 的链接改成 newName，保留别名、标题锚点和 ! 前缀。 */
export function replaceLinks(text: string, oldName: string, newName: string): string {
  const key = nameKey(oldName);
  return outsideCode(text, (s) =>
    s.replace(LINK_RE, (whole, bang: string, name: string, anchor = "", alias = "") =>
      nameKey(name) === key ? `${bang}[[${newName}${anchor}${alias}]]` : whole,
    ),
  );
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** 检查标题能否作为文件名；能则返回 null，否则返回原因。 */
export function invalidTitle(title: string): string | null {
  if (!title.trim()) return "标题不能为空";
  if (/[\\/:*?"<>|#^[\]]/.test(title)) return '标题不能包含 \\ / : * ? " < > | # ^ [ ]';
  if (/[. ]$/.test(title)) return "标题不能以空格或句点结尾";
  if (WINDOWS_RESERVED.test(title.trim())) return "这是 Windows 保留的文件名";
  if (title.length > 120) return "标题太长（最多 120 个字符）";
  return null;
}
