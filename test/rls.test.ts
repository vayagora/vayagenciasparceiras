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
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
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
  // Comando que deve ser barrado pelo RLS, sem abortar a transação do teste.
  async function denied(q: string, p: unknown[] = []) {
    await db.query("savepoint deny");
    await expect(db.query(q, p)).rejects.toThrow(/row-level security/);
    await db.query("rollback to savepoint deny");
  }

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
    await db.query(sql("0003_nao_sinalizados.sql"));
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
      -- etapas antigas, para testar a conversão da 0004
      insert into clients (expedition_id, name, email, phone, stage, note) values
        ('${ID.expA}', 'Cliente Outro Canal', 'outro@email.com', '', 'desistiu', 'Comprou por outro canal. Milhas.'),
        ('${ID.expA}', 'Cliente Sem Contato', 'semcontato@email.com', '', 'desistiu', 'Não quer contato.'),
        ('${ID.expA}', 'Cliente Proposta', 'proposta@email.com', '', 'proposta', '');
    `);
    await db.query(sql("0004_saldo_etapas_anexos.sql"));
    await db.query(sql("0005_anexos_storage.sql"));
    await db.query(GRANTS);
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

  it("parceiro não lê negócios não sinalizados no HubSpot nem os passageiros deles", async () => {
    const id = "40000000-0000-0000-0000-0000000000c1";
    await db.query(
      `insert into deals (id, hubspot_id, afiliado, signaled, hs_agency, closed_on, legs, end_date, voo)
       values ($1, '7777', 'Horizonte Eventos', false, 'Horizonte Eventos', '2026-09-01', '[{"city":"Madrid","date":"2026-11-12"}]', '2026-11-19', 500)`,
      [id],
    );
    await db.query(
      `insert into deal_passengers (deal_id, hubspot_contact_id, name, email, is_titular) values ($1, '990', 'Gislaine Souza', 'gislaine@email.com', true)`,
      [id],
    );
    await as(ID.pa, async () => {
      expect(await rows(`select id from deals where id = $1`, [id])).toEqual([]);
      expect(await rows(`select id from deal_passengers where deal_id = $1`, [id])).toEqual([]);
    });
    expect(await as(ID.vay, () => rows(`select id from deals where id = $1`, [id]))).toHaveLength(1);
    await db.query(`delete from deals where id = $1`, [id]);
  });

  it("equipe Vay lê todos os passageiros", async () => {
    const ps = await as(ID.vay, () => rows(`select name from deal_passengers order by name`));
    expect(ps.map((p) => p.name)).toEqual(["Ana Ribeiro", "Bia Lopes", "Emerson Souza", "Gislaine Souza"]);
  });

  it("0004 converte as etapas antigas na marcação manual", async () => {
    const r = await rows(`select name, stage from clients where name like 'Cliente %' order by name`);
    expect(r).toEqual([
      { name: "Cliente Outro Canal", stage: "outro_lugar" },
      { name: "Cliente Proposta", stage: "auto" },
      { name: "Cliente Sem Contato", stage: "nao_contactar" },
    ]);
  });

  it("parceiro só cadastra cliente com etapa automática e sem dados do HubSpot", async () => {
    await as(ID.pa, async () => {
      await db.query(`insert into clients (expedition_id, name, email) values ($1, 'Novo', 'novo@x.com')`, [ID.expA]);
      await denied(`insert into clients (expedition_id, name, email, stage) values ($1, 'X', 'x@x.com', 'nao_contactar')`, [ID.expA]);
      await expect(db.query(`update clients set stage = 'outro_lugar' where expedition_id = $1`, [ID.expA])).resolves.toMatchObject({ rowCount: 0 });
    });
  });

  it("saldo: parceiro lê só os próprios lançamentos e não lança nada", async () => {
    await db.query(`insert into balance_entries (partner_id, kind, amount, title) values ($1, 'in', 100, 'Bônus A'), ($2, 'out', 50, 'Gasto B')`, [ID.partnerA, ID.partnerB]);
    await as(ID.pa, async () => {
      expect((await rows(`select title from balance_entries`)).map((r) => r.title)).toEqual(["Bônus A"]);
      await denied(`insert into balance_entries (partner_id, kind, amount, title) values ($1, 'in', 1000, 'Eu mesmo')`, [ID.partnerA]);
    });
    expect(await as(ID.vay, () => rows(`select id from balance_entries`))).toHaveLength(2);
  });

  it("comentários e arquivos: parceiro vê só os dos próprios negócios; só a Vay grava", async () => {
    await db.query(`insert into deal_notes (deal_id, product, body) values ($1, 'voo', 'Bilhete A'), ($2, 'voo', 'Bilhete B')`, [ID.dealA, ID.dealB]);
    await db.query(`insert into storage.objects (bucket_id, name) values ('anexos', $1), ('anexos', $2), ('anexos', 'nao-e-uuid/voo/x.pdf')`, [
      `${ID.dealA}/voo/a.pdf`,
      `${ID.dealB}/voo/b.pdf`,
    ]);
    await as(ID.pa, async () => {
      expect((await rows(`select body from deal_notes`)).map((r) => r.body)).toEqual(["Bilhete A"]);
      expect((await rows(`select name from storage.objects`)).map((r) => r.name)).toEqual([`${ID.dealA}/voo/a.pdf`]);
      await denied(`insert into deal_notes (deal_id, product, body) values ($1, 'voo', 'x')`, [ID.dealA]);
      await denied(`insert into storage.objects (bucket_id, name) values ('anexos', $1)`, [`${ID.dealA}/voo/c.pdf`]);
    });
    await as(ID.vay, async () => {
      expect(await rows(`select name from storage.objects`)).toHaveLength(3);
      await db.query(`insert into storage.objects (bucket_id, name) values ('anexos', $1)`, [`${ID.dealA}/voo/d.pdf`]);
    });
  });

  it("dados de demonstração rodam depois das migrações", async () => {
    await db.query("drop schema public cascade; create schema public; truncate auth.users;");
    await db.query(sql("0001_init.sql"));
    await db.query(sql("0002_passageiros.sql"));
    await db.query(sql("0003_nao_sinalizados.sql"));
    await db.query(sql("0004_saldo_etapas_anexos.sql"));
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
