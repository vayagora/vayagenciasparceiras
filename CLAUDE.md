# CLAUDE.md — Sistema de Empresas Parceiras (Vay Agora)

Leia `docs/SPEC.md` antes de qualquer tarefa. Ela é a fonte da verdade das regras de negócio.

## Stack
- Next.js (App Router, TypeScript, Server Components/Actions)
- Supabase: Postgres, Auth, RLS. Migrações em `supabase/migrations/` (nunca editar uma migração já aplicada; crie outra)
- HubSpot via API REST (app privado). Cliente em `src/lib/hubspot.ts`
- Testes: Vitest (`npm test`)
- Visual: design system Vay Agora em `src/styles/ds/` (tokens CSS + fontes). Use as variáveis semânticas (`--color-primary`, `--text-strong`, `--surface-muted`…), nunca hex soltos

## Regras que não podem ser quebradas
1. Parceiro só acessa dados da própria empresa. Garantido por RLS no banco; toda tabela nova com dado de parceiro precisa de política RLS + teste.
2. Comissão só existe para negócio vinculado a uma expedição: voo 2%, hospedagem 3%, seguro 5% (`src/lib/commission.ts`).
3. Vínculo = afiliado + data + destino, com tolerâncias (`src/lib/matching.ts`). Qualquer mudança nele exige teste em `src/lib/matching.test.ts`.
4. Cliente fora da lista do parceiro: remunera e sinaliza. Nenhuma expedição: não remunera e sinaliza. Basta um passageiro do negócio estar na lista para não ser "fora da lista".
5. O parceiro nunca vê `hubspot_status`, sinalizações nem dados de clientes que não cadastrou (inclusive passageiros de um negócio que ele não cadastrou).
6. Fuso de referência America/Sao_Paulo (`src/lib/quarters.ts`). Painel do parceiro abre no último trimestre concluído.
7. Período fechado nunca é reescrito.
8. Segredos só em variáveis de ambiente (`.env.local`); nunca no código nem em logs.
9. Valores e comissão são do negócio, não do passageiro: aparecem uma vez por negócio (linha principal) e todo total soma por negócio, nunca por linha (SPEC §5).

## Convenções
- Interface em pt-BR; marca escrita sempre "Vay Agora".
- Textos de apoio em tooltip (componente `InfoTip`).
- Datas no banco em `date`/`timestamptz`; exibição dd/mm/aaaa.
- Valores monetários em `numeric(12,2)`; exibir em BRL pt-BR.

## Ordem de trabalho
Fase 1 → 2 → 3 (ver SPEC §8). Ao terminar uma fase: `npm run lint && npm test && npm run build` sem erros.

## Comandos
- `npm run dev` — servidor local
- `npm test` — testes
- `npx supabase db push` — aplicar migrações (após `supabase link`)
