// Testes de regras de acesso (RLS) no banco, com as migrações reais.
// Simula o mínimo do Supabase: esquema auth, auth.uid() e o papel "authenticated".
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const url = inject("pgUrl");
const MIG = path.resolve(__dirname, "../supabase/migrations");
const sql = (f: string) => fs.readFileSync(path.join(MIG, f), "utf8");

const SUPABASE_STUB = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
`;

const GRANTS = `
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
`;

const ID = {
  vay: "10000000-0000-0000-0000-000000000001",
  pa: "10000000-0000-0000-0000-000000000002",
  pb: "10000000-0000-0000-0000-000000000003",
  partnerA: "20000000-0000-0000-0000-00000000000a",
  partnerB: "20000000-0000-0000-0000-00000000000b",
  expA: "30000000-0000-0000-0000-00000000000a",
  expB: "30000000-0000-0000-0000-00000000000b",
  legacy: "40000000-0000-0000-0000-000000000000",
  dealA: "40000000-0000-0000-0000-00000000000a",
  dealB: "40000000-0000-0000-0000-00000000000b",
};

describe.skipIf(!url)("RLS · passageiros do negócio", () => {
  let db: Client;

  // Executa como um usuário logado (RLS ativo) e volta ao superusuário.
  async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("begin");
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      await db.query("set local role authenticated");
      return await fn();
    } finally {
      await db.query("rollback");
    }
  }
  const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("drop schema if exists public cascade; create schema public;");
    await db.query(SUPABASE_STUB);
    await db.query(sql("0001_init.sql"));

    // Dados criados antes da 0002 (formato antigo: um contato por negócio)
    await db.query(`
      insert into auth.users (id, email) values
        ('${ID.vay}', 'equipe@vayagora.com.br'), ('${ID.pa}', 'a@parceiro.com'), ('${ID.pb}', 'b@parceiro.com');
      insert into partners (id, name, afiliado) values
        ('${ID.partnerA}', 'Horizonte Eventos', 'Horizonte Eventos'),
        ('${ID.partnerB}', 'Grupo Atlas', 'Grupo Atlas');
      update profiles set role = 'vay' where id = '${ID.vay}';
      update profiles set partner_id = '${ID.partnerA}' where id = '${ID.pa}';
      update profiles set partner_id = '${ID.partnerB}' where id = '${ID.pb}';
      insert into deals (id, contact_name, email, afiliado, closed_on, legs, end_date, voo)
      values ('${ID.legacy}', 'Ana Ribeiro', 'Ana.Ribeiro@email.com', 'Horizonte Eventos', '2026-08-05',
              '[{"city":"Madrid","date":"2026-11-12"}]', '2026-11-19', 1000);
    `);

    await db.query(sql("0002_passageiros.sql"));
    await db.query(GRANTS);

    await db.query(`
      insert into expeditions (id, partner_id, name, city, start_date, days) values
        ('${ID.expA}', '${ID.partnerA}', 'Congresso', 'Madrid', '2026-11-13', 6),
        ('${ID.expB}', '${ID.partnerB}', 'Convenção', 'Gramado', '2026-12-03', 4);
      -- Parceiro A cadastrou só a Gislaine (o titular Emerson não está na lista)
      insert into clients (expedition_id, name, email, phone) values
        ('${ID.expA}', 'Gislaine Souza', 'gislaine@email.com', ''),
        ('${ID.expA}', 'Ana Ribeiro', 'ana.ribeiro@email.com', ''),
        ('${ID.expB}', 'Bia Lopes', '', '(51) 99999-0000');
      insert into deals (id, hubspot_id, afiliado, closed_on, legs, end_date, voo, hotel) values
        ('${ID.dealA}', '4512', 'Horizonte Eventos', '2026-09-01', '[{"city":"Madrid","date":"2026-11-12"}]', '2026-11-19', 8000, 6000),
        ('${ID.dealB}', '4600', 'Grupo Atlas', '2026-09-02', '[{"city":"Gramado","date":"2026-12-03"}]', '2026-12-06', 1500, 0);
      insert into deal_passengers (deal_id, hubspot_contact_id, name, email, phone, is_titular, position) values
        ('${ID.dealA}', '901', 'Emerson Souza', 'emerson@email.com', '(11) 98888-1111', true, 0),
        ('${ID.dealA}', '902', 'Gislaine Souza', 'gislaine@email.com', '', false, 1),
        ('${ID.dealB}', '903', 'Bia Lopes', '', '+55 51 99999-0000', true, 0);
    `);
  });

  afterAll(async () => {
    await db?.end();
  });

  it("migra o contato dos negócios antigos para titular em deal_passengers", async () => {
    const ps = await rows(`select name, email, is_titular from deal_passengers where deal_id = $1`, [ID.legacy]);
    expect(ps).toEqual([{ name: "Ana Ribeiro", email: "ana.ribeiro@email.com", is_titular: true }]);
    const cols = await rows(
      `select column_name from information_schema.columns where table_name = 'deals' and column_name in ('contact_name', 'email')`,
    );
    expect(cols).toEqual([]);
  });

  it("mantém a contagem de passageiros no negócio", async () => {
    const r = await rows(`select hubspot_id, passenger_count from deals where id in ($1, $2) order by hubspot_id`, [ID.dealA, ID.dealB]);
    expect(r).toEqual([
      { hubspot_id: "4512", passenger_count: 2 },
      { hubspot_id: "4600", passenger_count: 1 },
    ]);
  });

  it("parceiro não lê nome, e-mail nem telefone de passageiros que não cadastrou", async () => {
    const ps = await as(ID.pa, () => rows(`select deal_id, name, email, phone from deal_passengers order by name`));
    // Ana (negócio antigo, cadastrada) e Gislaine; o Emerson não aparece.
    expect(ps.map((p) => p.name)).toEqual(["Ana Ribeiro", "Gislaine Souza"]);
    expect(JSON.stringify(ps)).not.toContain("emerson");
    expect(JSON.stringify(ps)).not.toContain("98888-1111");
  });

  it("parceiro vê a contagem de passageiros do próprio negócio, sem identidade", async () => {
    const d = await as(ID.pa, () => rows(`select hubspot_id, passenger_count from deals where id = $1`, [ID.dealA]));
    expect(d).toEqual([{ hubspot_id: "4512", passenger_count: 2 }]);
  });

  it("parceiro A não lê nada do parceiro B (negócios, passageiros, clientes, expedições)", async () => {
    await as(ID.pa, async () => {
      expect(await rows(`select id from deals where id = $1`, [ID.dealB])).toEqual([]);
      expect(await rows(`select id from deal_passengers where deal_id = $1`, [ID.dealB])).toEqual([]);
      expect(await rows(`select id from clients where expedition_id = $1`, [ID.expB])).toEqual([]);
      expect(await rows(`select id from expeditions where id = $1`, [ID.expB])).toEqual([]);
    });
  });

  it("correspondência por telefone normalizado quando não há e-mail", async () => {
    const ps = await as(ID.pb, () => rows(`select name from deal_passengers`));
    expect(ps).toEqual([{ name: "Bia Lopes" }]);
  });

  it("parceiro não grava passageiros nem lê o histórico de sincronização", async () => {
    await as(ID.pa, async () => {
      await expect(
        db.query(`insert into deal_passengers (deal_id, name) values ($1, 'Intruso')`, [ID.dealA]),
      ).rejects.toThrow(/row-level security/);
    });
    await db.query(`insert into sync_runs (ok) values (true)`);
    expect(await as(ID.pa, () => rows(`select id from sync_runs`))).toEqual([]);
  });

  it("equipe Vay lê todos os passageiros", async () => {
    const ps = await as(ID.vay, () => rows(`select name from deal_passengers order by name`));
    expect(ps.map((p) => p.name)).toEqual(["Ana Ribeiro", "Bia Lopes", "Emerson Souza", "Gislaine Souza"]);
  });

  it("dados de demonstração rodam depois das migrações", async () => {
    await db.query("drop schema public cascade; create schema public; truncate auth.users;");
    await db.query(sql("0001_init.sql"));
    await db.query(sql("0002_passageiros.sql"));
    await db.query(fs.readFileSync(path.resolve(MIG, "../seed_demo.sql"), "utf8"));
    const r = await rows(`select passenger_count from deals where hubspot_id = '4513'`);
    expect(r).toEqual([{ passenger_count: 2 }]);
  });

  it("permite no máximo um titular por negócio", async () => {
    await expect(
      db.query(`update deal_passengers set is_titular = true where hubspot_contact_id in ('902', 'c4513b')`),
    ).rejects.toThrow(/deal_passengers_one_titular/);
  });
});
