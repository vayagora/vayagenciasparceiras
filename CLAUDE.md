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
0. **O sistema é só visualização (SPEC 2.0).** Nenhum dado de negócio, cliente, etapa, comentário ou valor é lançado no sistema: tudo vem do HubSpot. As únicas ações são da Vay: criar expedição, sincronizar, concluir/reabrir expedição, "Marcar como passageiros" um negócio conjunto da agência (ou voltar para conferência), marcar passageiro de negócio não sinalizado como conferido (ou desfazer) e administrar parceiros/usuários/acordo. Acompanhante que não viaja nunca se resolve no sistema: separa-se o negócio no HubSpot.
1. Parceiro só acessa dados da própria empresa. Garantido por RLS no banco; toda tabela nova com dado de parceiro precisa de política RLS + teste.
2. Comissão só existe para negócio **ganho** vinculado a uma expedição: passagem aérea 3%, hospedagem 3%, seguro 5% (`src/lib/commission.ts`; acordo "Regras de Negócio Padrões", item 4.1). Paga em créditos. Saldo e extrato vêm do HubSpot (SPEC 2.3): "Créditos abertos" da empresa da agência + objeto "Créditos" (0-410) associado (`syncCredits` em `src/lib/sync.ts`, `credit_entries`, `buildStatement` em `src/lib/balance.ts`). "Finalizar expedição" (`finishExpedition`) registra o valor apurado (`expeditions.finished_amount`); a equipe lança o crédito no HubSpot. Antes de finalizar: "a liberar" (`toRelease`).
3. Vínculo = agência (empresa associada) + data + destino, com tolerâncias (`src/lib/matching.ts`), sempre automático. Qualquer mudança nele exige teste em `src/lib/matching.test.ts`.
4. Negócio de agência = "Origem do Negócio" "Agência parceira" + empresa da agência associada, em qualquer etapa. Abas da expedição (SPEC 2.4): **Passageiros** = negócios da agência com um passageiro, ou conjuntos aprovados pela Vay com a mesma composição (`expedition_approvals`), sem nenhuma pendência; **A conferir** = negócio conjunto não aprovado (ou cuja composição mudou), negócio não sinalizado que combina com a expedição, e todo passageiro com qualquer pendência, com quem está no mesmo negócio (propagação em `Ledger.state`); **Conferidos** = passageiros de negócio não sinalizado marcados pela Vay (`expedition_reviews`). Só contatos com rótulo "Passageiro" contam. Ordem alfabética com o grupo do negócio junto (`sortGrouped`). Parceiro: as pendências vêm de `expedition_pending` (gravada por `refreshPending` em `src/lib/pending.ts` após sincronizar e após cada marcação), e ele vê só os nomes ("Pendências de lançamento").
5. Forma de pagamento: dinheiro gera cashback; 100% "Crédito na VAY" não gera; misto fica a definir (R$ 0) até decisão sobre o fluxo no HubSpot.
6. O parceiro nunca vê sinalizações, negócios não sinalizados, passageiros "Conferidos" nem dados de negócios de outra agência. Dos próprios negócios pendentes, a tela mostra só os nomes.
7. Fuso de referência America/Sao_Paulo (`src/lib/format.ts`: `todayIso`, trimestres). Painel do parceiro abre no último trimestre concluído (filtro de visualização; a apuração é por expedição, não trimestral).
8. Expedição concluída mantém o valor apurado, mesmo que o HubSpot mude; só a Vay pode reabrir (com aviso), o que descarta o valor. Concluir é bloqueado enquanto houver negócio da agência em "A conferir".
9. Segredos só em variáveis de ambiente (`.env.local`); nunca no código nem em logs.
10. Valores e comissão são do negócio, não do passageiro: aparecem uma vez por negócio (linha principal) e todo total soma por negócio, nunca por linha (SPEC §5).
11. Negócio não sinalizado no HubSpot nunca remunera nem aparece para o parceiro (RLS em `deals.signaled`); a Vay vê como pendência para corrigir no HubSpot.
12. Etapa do cliente = etapa do negócio no HubSpot (`dealStage`/`bestStage` em `src/lib/commission.ts`): compra concluída > em negociação > em contato > não comprou. Observação = "Observações para parceiro" do negócio (`deals.partner_note`).

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
