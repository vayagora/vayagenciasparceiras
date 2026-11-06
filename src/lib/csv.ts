// Lê linhas de CSV ou coladas do Excel/Google Planilhas: nome, e-mail, telefone.
export type ClientRow = { name: string; email: string; phone: string };

export function parseRows(text: string): ClientRow[] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const d = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  let rows = lines.map((l) => l.split(d).map((x) => x.trim().replace(/^"|"$/g, "")));
  const h = rows[0].map((x) => x.toLowerCase());
  let iN = 0;
  let iE = 1;
  let iT = 2;
  if (h.some((x) => /nome|mail|telefone|celular/.test(x))) {
    iN = h.findIndex((x) => /nome/.test(x));
    iE = h.findIndex((x) => /mail/.test(x));
    iT = h.findIndex((x) => /tel|fone|celular|whats/.test(x));
    if (iN < 0) iN = 0;
    rows = rows.slice(1);
  }
  return rows
    .map((r) => ({
      name: r[iN] || "",
      email: iE >= 0 ? r[iE] || "" : "",
      phone: iT >= 0 ? r[iT] || "" : "",
    }))
    .filter((r) => r.name && (r.email || r.phone));
}
