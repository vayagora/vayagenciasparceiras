// Sobe um Postgres temporário para os testes de RLS (test/rls.test.ts).
// - Se TEST_DATABASE_URL estiver definido, usa esse banco (precisa estar vazio).
// - Senão, procura os binários do Postgres (initdb/pg_ctl) e cria um cluster descartável.
// - Sem Postgres disponível, os testes de RLS são pulados (com aviso).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";

function findBin(): string | null {
  const dirs = [process.env.PG_BIN, "/usr/lib/postgresql", "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean) as string[];
  for (const d of dirs) {
    if (fs.existsSync(path.join(d, "initdb"))) return d;
    if (d === "/usr/lib/postgresql" && fs.existsSync(d)) {
      const v = fs.readdirSync(d).sort().reverse()[0];
      if (v && fs.existsSync(path.join(d, v, "bin", "initdb"))) return path.join(d, v, "bin");
    }
  }
  return null;
}

export default function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    project.provide("pgUrl", process.env.TEST_DATABASE_URL);
    return;
  }
  const bin = findBin();
  if (!bin) {
    console.warn("[rls] Postgres não encontrado: testes de RLS pulados. Defina TEST_DATABASE_URL ou PG_BIN.");
    project.provide("pgUrl", "");
    return;
  }
  // O Postgres não roda como root: nesse caso usa o usuário "postgres".
  const asRoot = process.getuid?.() === 0;
  const run = (cmd: string, args: string[]) =>
    asRoot
      ? execFileSync("runuser", ["-u", "postgres", "--", path.join(bin, cmd), ...args], { stdio: "pipe" })
      : execFileSync(path.join(bin, cmd), args, { stdio: "pipe" });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vay-pg-"));
  if (asRoot) execFileSync("chown", ["postgres", dir]);
  const port = String(55000 + Math.floor(Math.random() * 5000));
  run("initdb", ["-D", dir, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  // -l: log em arquivo (sem isso o servidor segura a saída e o setup não termina)
  run("pg_ctl", ["-D", dir, "-l", path.join(dir, "server.log"), "-o", `-p ${port} -k ${dir} -c listen_addresses=localhost`, "-w", "start"]);
  project.provide("pgUrl", `postgres://postgres@localhost:${port}/postgres`);

  return () => {
    try {
      run("pg_ctl", ["-D", dir, "-m", "immediate", "stop"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    pgUrl: string;
  }
}
