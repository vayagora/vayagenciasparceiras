# CLAUDE.md — Sistema de Empresas Parceiras (Vay Agora)

Leia `docs/SPEC.md` antes de qualquer tarefa. Ela é a fonte da verdade das regras de negócio.

## Stack
- Next.js (App Router, TypeScript, Server Components/Actions)
- Supabase: Postgres, Auth, RLS. Migrações em `supabase/migrations/` (nunca editar uma migração já aplicada; crie outra)
- HubSpot via API REST (app privado). Cliente em `src/lib/hubspot.ts`, sincronização em `src/lib/sync.ts`, mapeamento dos campos em `docs/HUBSPOT.md`
- Testes: Vitest (`npm test`)
- Arquivos (anexos dos produtos e acordos de parceria): Supabase Storage, bucket privado `anexos`
- Visual: design system Vay Agora em `src/app/tokens.css` (tokens CSS) + `src/app/globals.css`; fontes em `public/fonts/`. Use as variáveis semânticas (`--color-primary`, `--text-strong`, `--surface-muted`…), nunca hex soltos

## Regras que não podem ser quebradas
1. Parceiro só acessa dados da própria empresa. Garantido por RLS no banco; toda tabela nova com dado de parceiro precisa de política RLS + teste.
2. Comissão só existe para negócio vinculado a uma expedição: passagem aérea 3%, hospedagem 3%, seguro 5% (`src/lib/commission.ts`; acordo "Regras de Negócio Padrões", item 4.1). Paga em créditos: saldo = comissões + entradas − saídas (`src/lib/balance.ts`).
3. Vínculo = afiliado + data + destino, com tolerâncias (`src/lib/matching.ts`). Qualquer mudança nele exige teste em `src/lib/matching.test.ts`.
4. Cliente ↔ passageiro: contato do HubSpot, e-mail ou telefone; senão, nome completo idêntico (sinaliza "Vinculado pelo nome"); senão, vínculo manual da Vay (grava o contato no cliente). A mesma regra vale no RLS (`passenger_visible_to_partner`, migração 0010). Cliente fora da lista do parceiro: remunera e sinaliza. Nenhuma expedição: não remunera e sinaliza. Basta um passageiro do negócio estar na lista para não ser "fora da lista"; se outro passageiro não estiver, é inconsistência (acompanhante fora da expedição) e vai para conferência.
5a. Toda compra ligada a uma expedição da agência remunera, mesmo de cliente recorrente; compra fora das expedições da agência nunca remunera.
5b. Forma de pagamento: dinheiro gera cashback; 100% "Crédito na VAY" não gera; misto fica a definir (R$ 0) e pendente até a Vay editar o cashback. Cashback editado substitui o calculado e toda edição vai para o histórico (`deal_cashback_history`).
5. O parceiro nunca vê `hubspot_status`, sinalizações nem dados de clientes que não cadastrou (inclusive passageiros de um negócio que ele não cadastrou).
6. Fuso de referência America/Sao_Paulo (`src/lib/format.ts`: `todayIso`, trimestres). Painel do parceiro abre no último trimestre concluído.
7. Período fechado nunca é reescrito.
8. Segredos só em variáveis de ambiente (`.env.local`); nunca no código nem em logs.
9. Valores e comissão são do negócio, não do passageiro: aparecem uma vez por negócio (linha principal) e todo total soma por negócio, nunca por linha (SPEC §5).
10. Negócio não sinalizado no HubSpot nunca remunera nem aparece para o parceiro (RLS em `deals.signaled`).
11. Etapa do cliente: compra concluída (HubSpot) > não contactar / comprou em outro lugar (Vay) > em negociação (HubSpot) > tentando / em contato / chamar depois (Vay) > não contactado (`shownStage` em `src/lib/ledger.ts`).
12. Observação e comentários do cliente: a **observação principal** é a do HubSpot (campo "Observações para parceiro" do negócio, `clients.hs_note`). Além dela, a Vay registra **comentários** (`client_comments`, histórico imutável com data, hora e autor vindos da sessão). Comentário **interno** só a Vay vê; o parceiro vê só os **públicos** dos próprios clientes (RLS + teste). `clients.partner_note` e `clients.note` não são mais usadas na interface.

## Convenções
- Interface em pt-BR; marca escrita sempre "Vay Agora".
- Textos de apoio em tooltip (componente `Tip` em `src/components/ui.tsx`).
- Datas no banco em `date`/`timestamptz`; exibição dd/mm/aaaa.
- Valores monetários em `numeric(12,2)`; exibir em BRL pt-BR.

## Ordem de trabalho
Fase 1 → 2 → 3 (ver SPEC §8). Ao terminar uma fase: `npm run lint && npm test && npm run build` sem erros.

## Comandos
- `npm run dev` — servidor local
- `npm test` — testes (os de RLS sobem um Postgres local em `test/pg-setup.ts`; sem Postgres, são pulados)
- `npx supabase db push` — aplicar migrações (após `supabase link`). Sem a CLI: colar cada migração nova no SQL Editor, **antes** de publicar o código que depende dela
