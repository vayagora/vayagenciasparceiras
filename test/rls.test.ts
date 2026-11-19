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

describe.skipIf(!url)("RLS · regras de acesso", () => {
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

  // Comando que deve falhar (fora de transação), sem deixar efeito.
  async function fails(q: string, p: unknown[], re: RegExp) {
    await db.query("begin");
    try {
      await expect(db.query(q, p)).rejects.toThrow(re);
    } finally {
      await db.query("rollback");
    }
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
    await db.query(sql("0006_acordo.sql"));
    await db.query(sql("0007_pagamento_cashback.sql"));
    await db.query(sql("0008_contato_manual.sql"));
    // notas antigas, para testar a conversão em comentários da 0009
    await db.query(`
      update clients set partner_note = 'Prefere janela', last_follow_up = '2026-10-01' where name = 'Gislaine Souza';
      update clients set note = 'Nota interna da Bia' where name = 'Bia Lopes';
    `);
    await db.query(sql("0009_comentarios.sql"));
    await db.query(sql("0010_vinculo_por_nome.sql"));
    await db.query(sql("0011_comprador_passageiro.sql"));
    await db.query(sql("0012_conferencia.sql"));
    await db.query(sql("0013_somente_leitura.sql"));
    await db.query(sql("0014_conferencia_por_passageiro.sql"));
    await db.query(sql("0015_pendencias_de_lancamento.sql"));
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

  it("0014: parceiro só vê negócios da própria agência com um passageiro (o do casal fica com a Vay, a conferir)", async () => {
    await as(ID.pa, async () => {
      expect((await rows(`select name from deal_passengers order by name`)).map((p) => p.name)).toEqual(["Ana Ribeiro"]);
      expect(await rows(`select id from deals where id = $1`, [ID.dealA])).toEqual([]);
    });
    expect(await as(ID.vay, () => rows(`select id from deals where id = $1`, [ID.dealA]))).toHaveLength(1);
  });

  it("0014: conferência por passageiro é só da Vay; uma marcação por pessoa na expedição", async () => {
    await as(ID.pa, async () => {
      await denied(`insert into expedition_reviews (expedition_id, person_key, person_name) values ($1, 'c:902', 'Gislaine')`, [ID.expA]);
    });
    await as(ID.vay, async () => {
      await db.query(`insert into expedition_reviews (expedition_id, person_key, person_name, reviewed_by_name) values ($1, 'c:902', 'Gislaine', 'Ana')`, [ID.expA]);
      expect(await rows(`select person_name from expedition_reviews`)).toEqual([{ person_name: "Gislaine" }]);
      await db.query("savepoint s");
      await expect(db.query(`insert into expedition_reviews (expedition_id, person_key) values ($1, 'c:902')`, [ID.expA])).rejects.toThrow(/unique|duplicate/);
      await db.query("rollback to savepoint s");
    });
    await db.query(`insert into expedition_reviews (expedition_id, person_key, person_name) values ($1, 'c:902', 'Gislaine')`, [ID.expA]);
    expect(await as(ID.pa, () => rows(`select id from expedition_reviews`))).toEqual([]);
    await db.query(`delete from expedition_reviews`);
  });

  it("parceiro A não lê nada do parceiro B (negócios, passageiros, expedições)", async () => {
    await as(ID.pa, async () => {
      expect(await rows(`select id from deals where id = $1`, [ID.dealB])).toEqual([]);
      expect(await rows(`select id from deal_passengers where deal_id = $1`, [ID.dealB])).toEqual([]);
      expect(await rows(`select id from expeditions where id = $1`, [ID.expB])).toEqual([]);
    });
    expect(await as(ID.pb, () => rows(`select name from deal_passengers`))).toEqual([{ name: "Bia Lopes" }]);
  });

  it("0013: lista de clientes e comentários do sistema foram apagados", async () => {
    expect(await rows(`select to_regclass('public.clients') as a, to_regclass('public.client_comments') as b`)).toEqual([{ a: null, b: null }]);
  });

  it("0013: negócio em aberto (sem data de fechamento) e etapa do HubSpot", async () => {
    const [d] = await rows(
      `insert into deals (hubspot_id, afiliado, closed_on, hs_stage, stage_kind, partner_note, legs, end_date)
       values ('9200', 'Horizonte Eventos', null, 'presentationscheduled', 'open', 'Cotando', '[{"city":"Madrid","date":"2026-11-12"}]', '2026-11-19') returning id`,
    );
    await db.query(`insert into deal_passengers (deal_id, hubspot_contact_id, name, is_titular) values ($1, '9201', 'Claudia', true)`, [d.id]);
    await fails(`update deals set stage_kind = 'outro' where id = $1`, [d.id], /check/);
    expect(await as(ID.pa, () => rows(`select partner_note from deals where id = $1`, [d.id]))).toEqual([{ partner_note: "Cotando" }]);
    await db.query(`delete from deals where id = $1`, [d.id]);
  });

  it("0013: só a Vay cria, altera e finaliza expedições", async () => {
    await as(ID.pa, async () => {
      await denied(`insert into expeditions (partner_id, name, city, start_date, days) values ($1, 'Minha', 'Lisboa', '2027-01-01', 3)`, [ID.partnerA]);
      await expect(db.query(`update expeditions set name = 'x', finished_at = now() where id = $1`, [ID.expA])).resolves.toMatchObject({ rowCount: 0 });
    });
    await as(ID.vay, async () => {
      await db.query(`update expeditions set finished_at = now(), finished_by_name = 'Gabriel' where id = $1`, [ID.expA]);
      expect(await rows(`select finished_by_name from expeditions where id = $1`, [ID.expA])).toEqual([{ finished_by_name: "Gabriel" }]);
    });
  });

  it("0013: fechamento lança um único crédito por expedição; parceiro vê só o próprio", async () => {
    await db.query(`insert into balance_entries (partner_id, expedition_id, kind, amount, title) values ($1, $2, 'in', 420, 'Créditos da expedição Congresso')`, [ID.partnerA, ID.expA]);
    await fails(
      `insert into balance_entries (partner_id, expedition_id, kind, amount, title) values ($1, $2, 'in', 1, 'De novo')`,
      [ID.partnerA, ID.expA],
      /balance_entries_expedition_key/,
    );
    expect(await as(ID.pb, () => rows(`select id from balance_entries where expedition_id = $1`, [ID.expA]))).toEqual([]);
    await fails(`delete from expeditions where id = $1`, [ID.expA], /foreign key/);
    await db.query(`delete from balance_entries where expedition_id = $1`, [ID.expA]);
  });

  it("0015: pendências de lançamento: parceiro vê só os nomes do próprio negócio com vários passageiros, sem os conferidos", async () => {
    await db.query(`update deals set matched_expedition_id = $1 where id = $2`, [ID.expA, ID.dealA]);
    // não sinalizado com vários passageiros na mesma expedição: nunca aparece para o parceiro
    const [u] = await rows(
      `insert into deals (hubspot_id, afiliado, signaled, hs_agency, closed_on, legs, end_date, matched_expedition_id)
       values ('9300', '', false, 'Horizonte Eventos', '2026-09-01', '[{"city":"Madrid","date":"2026-11-12"}]', '2026-11-19', $1) returning id`,
      [ID.expA],
    );
    await db.query(`insert into deal_passengers (deal_id, hubspot_contact_id, name, is_titular, position) values ($1, '931', 'Estranho Um', true, 0), ($1, '932', 'Estranho Dois', false, 1)`, [u.id]);
    const names = (uid: string, exp: string) => as(uid, async () => (await rows(`select person_name from partner_pending_names($1) order by 1`, [exp])).map((r) => r.person_name));

    expect(await names(ID.pa, ID.expA)).toEqual(["Emerson Souza", "Gislaine Souza"]);
    expect(await names(ID.pb, ID.expA)).toEqual([]); // expedição de outro parceiro
    // conferido pela Vay: some
    await db.query(`insert into expedition_reviews (expedition_id, person_key, person_name) values ($1, 'c:902', 'Gislaine Souza')`, [ID.expA]);
    expect(await names(ID.pa, ID.expA)).toEqual(["Emerson Souza"]);
    // e o parceiro continua sem acesso aos negócios e passageiros em si
    await as(ID.pa, async () => {
      expect(await rows(`select id from deal_passengers where deal_id = $1`, [ID.dealA])).toEqual([]);
    });
    await db.query(`delete from expedition_reviews`);
    await db.query(`delete from deals where id = $1`, [u.id]);
    await db.query(`update deals set matched_expedition_id = null where id = $1`, [ID.dealA]);
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

  it("saldo: parceiro lê só os próprios lançamentos e não lança nada", async () => {
    await db.query(`insert into balance_entries (partner_id, kind, amount, title) values ($1, 'in', 100, 'Bônus A'), ($2, 'out', 50, 'Gasto B')`, [ID.partnerA, ID.partnerB]);
    await as(ID.pa, async () => {
      expect((await rows(`select title from balance_entries`)).map((r) => r.title)).toEqual(["Bônus A"]);
      await denied(`insert into balance_entries (partner_id, kind, amount, title) values ($1, 'in', 1000, 'Eu mesmo')`, [ID.partnerA]);
    });
    expect(await as(ID.vay, () => rows(`select id from balance_entries`))).toHaveLength(2);
  });

  it("comentários e arquivos: parceiro vê só os dos próprios negócios; só a Vay grava", async () => {
    await db.query(`insert into deal_notes (deal_id, product, body) values ($1, 'voo', 'Bilhete A'), ($2, 'voo', 'Bilhete B')`, [ID.legacy, ID.dealB]);
    await db.query(`insert into storage.objects (bucket_id, name) values ('anexos', $1), ('anexos', $2), ('anexos', 'nao-e-uuid/voo/x.pdf')`, [
      `${ID.legacy}/voo/a.pdf`,
      `${ID.dealB}/voo/b.pdf`,
    ]);
    await as(ID.pa, async () => {
      expect((await rows(`select body from deal_notes`)).map((r) => r.body)).toEqual(["Bilhete A"]);
      expect((await rows(`select name from storage.objects`)).map((r) => r.name)).toEqual([`${ID.legacy}/voo/a.pdf`]);
      await denied(`insert into deal_notes (deal_id, product, body) values ($1, 'voo', 'x')`, [ID.legacy]);
      await denied(`insert into storage.objects (bucket_id, name) values ('anexos', $1)`, [`${ID.legacy}/voo/c.pdf`]);
    });
    await as(ID.vay, async () => {
      expect(await rows(`select name from storage.objects`)).toHaveLength(3);
      await db.query(`insert into storage.objects (bucket_id, name) values ('anexos', $1)`, [`${ID.legacy}/voo/d.pdf`]);
    });
  });

  it("acordo de parceria: parceiro baixa só o próprio; só a Vay envia", async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('anexos', $1), ('anexos', $2)`, [
      `acordos/${ID.partnerA}/acordo-a.pdf`,
      `acordos/${ID.partnerB}/acordo-b.pdf`,
    ]);
    await as(ID.pa, async () => {
      const names = (await rows(`select name from storage.objects where name like 'acordos/%'`)).map((r) => r.name);
      expect(names).toEqual([`acordos/${ID.partnerA}/acordo-a.pdf`]);
      await denied(`insert into storage.objects (bucket_id, name) values ('anexos', $1)`, [`acordos/${ID.partnerA}/meu.pdf`]);
      await expect(db.query(`update partners set agreement_path = 'x' where id = $1`, [ID.partnerA])).resolves.toMatchObject({ rowCount: 0 });
    });
  });

  it("histórico do cashback: só a Vay lê e grava; o parceiro vê só o valor final do próprio negócio", async () => {
    await db.query(`update deals set cashback_override = 120, payment_methods = '{"Crédito na VAY","Pix/Ted/Doc"}' where id = $1`, [ID.legacy]);
    await db.query(`insert into deal_cashback_history (deal_id, old_value, new_value, calculated, note) values ($1, null, 120, 0, 'misto')`, [ID.legacy]);
    await as(ID.pa, async () => {
      expect(await rows(`select id from deal_cashback_history`)).toEqual([]);
      await denied(`insert into deal_cashback_history (deal_id, new_value, calculated) values ($1, 999, 0)`, [ID.legacy]);
      expect(await rows(`select cashback_override::float as v from deals where id = $1`, [ID.legacy])).toEqual([{ v: 120 }]);
      await expect(db.query(`update deals set cashback_override = 999 where id = $1`, [ID.legacy])).resolves.toMatchObject({ rowCount: 0 });
    });
    expect(await as(ID.vay, () => rows(`select note from deal_cashback_history`))).toEqual([{ note: "misto" }]);
  });

  it("registro da conferência (avisos conferidos): só a Vay lê e grava", async () => {
    await db.query(`insert into deal_reviews (deal_id, flags, reviewed_by_name) values ($1, '{fora,acompanhante}', 'Ana Vay')`, [ID.dealA]);
    await as(ID.pa, async () => {
      expect(await rows(`select deal_id from deal_reviews`)).toEqual([]);
      await denied(`insert into deal_reviews (deal_id, flags) values ($1, '{}')`, [ID.dealB]);
      await expect(db.query(`delete from deal_reviews where deal_id = $1`, [ID.dealA])).resolves.toMatchObject({ rowCount: 0 });
    });
    expect(await as(ID.vay, () => rows(`select flags from deal_reviews`))).toEqual([{ flags: ["fora", "acompanhante"] }]);
  });

  it("0011: nome ignora de/da/do; comprador que não viaja não conta como passageiro", async () => {
    expect(
      await rows(
        `select names_match('Gabriela Tolentino Boaventura Almeida', 'Gabriela Tolentino Boaventura de Almeida') as a,
                names_match('Ana da Silva', 'Ana Silva') as b, names_match('Ana', 'Ana de') as c`,
      ),
    ).toEqual([{ a: true, b: true, c: false }]);
    const [d] = await rows(
      `insert into deals (hubspot_id, afiliado, closed_on, legs, end_date, voo) values ('9100', 'Horizonte Eventos', '2026-10-09', '[{"city":"Madrid","date":"2026-11-12"}]', '2026-11-19', 1000) returning id`,
    );
    await db.query(
      `insert into deal_passengers (deal_id, hubspot_contact_id, name, is_titular, is_buyer, is_passenger, position) values
        ($1, '1', 'Pai Comprador', true, true, false, 0), ($1, '2', 'Filho Viajante', false, false, true, 1)`,
      [d.id],
    );
    expect(await rows(`select passenger_count from deals where id = $1`, [d.id])).toEqual([{ passenger_count: 1 }]);
    await db.query(`delete from deals where id = $1`, [d.id]);
  });

  it("dados de demonstração rodam depois das migrações", async () => {
    await db.query("drop schema public cascade; create schema public; truncate auth.users;");
    await db.query(sql("0001_init.sql"));
    await db.query(sql("0002_passageiros.sql"));
    await db.query(sql("0003_nao_sinalizados.sql"));
    await db.query(sql("0004_saldo_etapas_anexos.sql"));
    await db.query(sql("0006_acordo.sql"));
    await db.query(sql("0007_pagamento_cashback.sql"));
    await db.query(sql("0008_contato_manual.sql"));
    await db.query(sql("0009_comentarios.sql"));
    await db.query(sql("0010_vinculo_por_nome.sql"));
    await db.query(sql("0011_comprador_passageiro.sql"));
    await db.query(sql("0012_conferencia.sql"));
    await db.query(sql("0013_somente_leitura.sql"));
    await db.query(sql("0014_conferencia_por_passageiro.sql"));
    await db.query(sql("0015_pendencias_de_lancamento.sql"));
    await db.query(fs.readFileSync(path.resolve(MIG, "../seed_demo.sql"), "utf8"));
    const r = await rows(`select passenger_count from deals where hubspot_id = '4513'`);
    expect(r).toEqual([{ passenger_count: 2 }]);
    expect(await rows(`select stage_kind from deals where hubspot_id in ('4514', '4515') order by hubspot_id`)).toEqual([{ stage_kind: "open" }, { stage_kind: "lost" }]);
  });

  it("permite no máximo um titular por negócio", async () => {
    await expect(
      db.query(`update deal_passengers set is_titular = true where hubspot_contact_id in ('902', 'c4513b')`),
    ).rejects.toThrow(/deal_passengers_one_titular/);
  });
});
