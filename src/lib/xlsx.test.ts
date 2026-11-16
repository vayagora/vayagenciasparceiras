import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildXlsx, colName, slug } from "./xlsx";

const hasOpenpyxl = (() => {
  try {
    execFileSync("python3", ["-I", "-c", "import openpyxl"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

describe("gerador de .xlsx", () => {
  it("colunas e nome de arquivo", () => {
    expect([colName(0), colName(25), colName(26), colName(27)]).toEqual(["A", "Z", "AA", "AB"]);
    expect(slug("Expedição Tailândia 2026")).toBe("expedicao-tailandia-2026");
  });

  it("começa como um zip", () => {
    const b = buildXlsx("Clientes", ["A"], [["x"]]);
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it.skipIf(!hasOpenpyxl)("abre numa biblioteca de planilhas: textos, números, acentos e cabeçalho em negrito", () => {
    const b = buildXlsx(
      "Clientes",
      ["Cliente", "Ganho"],
      [
        ["José Ação & <Cia>", 707.1],
        ["Linha 2\ncom quebra", null],
      ],
      [30, 12],
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-"));
    const f = path.join(dir, "t.xlsx");
    fs.writeFileSync(f, b);
    const out = execFileSync(
      "python3",
      [
        "-I",
        "-c",
        "import openpyxl,sys,json;ws=openpyxl.load_workbook(sys.argv[1]).active;print(json.dumps({'t':ws.title,'rows':[list(r) for r in ws.iter_rows(values_only=True)],'bold':ws['A1'].font.b,'b2':ws['A2'].font.b}))",
        f,
      ],
      { encoding: "utf8" },
    );
    fs.rmSync(dir, { recursive: true, force: true });
    expect(JSON.parse(out)).toEqual({
      t: "Clientes",
      rows: [
        ["Cliente", "Ganho"],
        ["José Ação & <Cia>", 707.1],
        ["Linha 2\ncom quebra", null],
      ],
      bold: true,
      b2: false,
    });
  });
});
