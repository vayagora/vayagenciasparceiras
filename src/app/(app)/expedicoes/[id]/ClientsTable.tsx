"use client";

// Tabela de clientes da expedição (SPEC 2.4): os passageiros dos negócios da agência no HubSpot.
// Filtros, ordenação (A–Z por grupo: quem está no mesmo negócio fica junto, como sub-linha) e Excel.
// Etapa e observação vêm do HubSpot. A Vay pode marcar um passageiro como acompanhante (vai para Conferidos).
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Tone } from "@/lib/commission";
import type { StageId } from "@/lib/types";
import { buildXlsx, slug, type Cell } from "@/lib/xlsx";
import { setPersonReviewed } from "../../actions";
import { ProductCell, type ProductDeal } from "./ProductCell";

type Product = "voo" | "hotel" | "seguro";

export type TableRow = {
  key: string;
  name: string;
  email: string;
  phone: string;
  stage: { id: StageId; label: string; tone: Tone; sub?: string };
  // Negócios da pessoa (número e link para o HubSpot, só para a Vay)
  deals: { no: string; url: string | null; stage: string }[];
  prods: { product: Product; primary: ProductDeal[]; included: ProductDeal[] }[];
  com: number | null; // null = "—" (valor está na linha principal de outro passageiro, ou ainda não comprou)
  hsNote: string;
  // Pessoas do mesmo negócio ficam juntas (sub-linhas)
  group: string;
  // Negócio com vários passageiros (a Vay confere se há acompanhante)
  multi: boolean;
  // Rastreio (só Vay): outros passageiros do mesmo negócio e onde estão
  matesTxt?: string;
};

export type Option = { value: string; label: string };

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function ClientsTable({
  rows,
  earnHeader,
  stageOptions,
  expName,
  emptyText,
  companionExpId,
}: {
  rows: TableRow[];
  earnHeader: string;
  stageOptions: Option[];
  expName: string;
  emptyText: string;
  // Vay: id da expedição para o botão "É acompanhante" (parceiro: ausente)
  companionExpId?: string;
}) {
  const [q, setQ] = useState("");
  const [fStage, setFStage] = useState("");
  const [asc, setAsc] = useState(true);
  const [noteKey, setNoteKey] = useState<string | null>(null);

  const shown = useMemo(() => {
    const term = fold(q.trim());
    const list = rows.filter((r) => {
      if (term) {
        const deals = r.deals.map((d) => d.no).join(" ").replace(/#/g, "");
        if (!fold(r.name).includes(term) && !deals.includes(term.replace(/#/g, ""))) return false;
      }
      if (fStage && r.stage.id !== fStage) return false;
      return true;
    });
    // Ordem alfabética por grupo: o grupo entra na posição do primeiro nome dele; dentro do grupo, A–Z.
    const byName = (a: TableRow, b: TableRow) => fold(a.name).localeCompare(fold(b.name), "pt-BR");
    const groups = new Map<string, TableRow[]>();
    for (const r of [...list].sort(byName)) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
    const ordered = [...groups.values()];
    if (!asc) ordered.reverse();
    return ordered.flatMap((g) => g.map((r, i) => ({ ...r, sub: i > 0 })));
  }, [rows, q, fStage, asc]);

  const filtered = !!(q.trim() || fStage);
  const noteRow = rows.find((r) => r.key === noteKey) ?? null;

  // Rolagem horizontal também no topo, sincronizada com a de baixo
  const topRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tblRef = useRef<HTMLTableElement>(null);
  const [tblW, setTblW] = useState(0);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const measure = () => {
      const w = tblRef.current?.scrollWidth ?? 0;
      setTblW(w);
      setOverflow(w > (wrapRef.current?.clientWidth ?? 0) + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (tblRef.current) ro.observe(tblRef.current);
    return () => ro.disconnect();
  }, [shown.length]);
  const sync = (from: "top" | "wrap") => {
    const a = from === "top" ? topRef.current : wrapRef.current;
    const b = from === "top" ? wrapRef.current : topRef.current;
    if (a && b && b.scrollLeft !== a.scrollLeft) b.scrollLeft = a.scrollLeft;
  };

  const exportXlsx = () => {
    const header = ["Cliente", "E-mail", "Telefone", "Etapa", "Negócio(s)", "Voo", "Hospedagem", "Seguro", earnHeader, "Observação (HubSpot)"];
    const data: Cell[][] = shown.map((r) => {
      const prod = (k: Product) => {
        const p = r.prods.find((x) => x.product === k);
        if (!p) return null;
        const v = p.primary.reduce((a, x) => a + (x.value ?? 0), 0);
        if (v > 0) return Math.round(v * 100) / 100;
        return p.included.length ? `Incluído no ${p.included.map((x) => x.no).join(", ")}` : null;
      };
      return [
        r.name,
        r.email,
        r.phone,
        r.stage.label + (r.stage.sub ? ` (${r.stage.sub})` : ""),
        r.deals.map((d) => d.no).join(", "),
        prod("voo"),
        prod("hotel"),
        prod("seguro"),
        r.com === null ? null : Math.round(r.com * 100) / 100,
        r.hsNote,
      ];
    });
    const bytes = buildXlsx("Clientes", header, data, [32, 30, 20, 26, 18, 14, 14, 14, 16, 60]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${slug(expName)}-${today}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div className="toolbar" role="search" aria-label="Filtrar clientes">
        <div className="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input className="input" type="search" aria-label="Buscar por nome ou negócio" placeholder="Buscar por nome ou negócio" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select cell-sel" aria-label="Filtrar por etapa" value={fStage} onChange={(e) => setFStage(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">Todas as etapas</option>
          {stageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="small muted">{shown.length} de {rows.length} {rows.length === 1 ? "cliente" : "clientes"}</span>
        {filtered ? (
          <button type="button" className="btn ghost sm" onClick={() => { setQ(""); setFStage(""); }}>
            Limpar filtros
          </button>
        ) : null}
        <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
          <button type="button" className="iconbtn wide" aria-label={asc ? "Ordem A–Z (trocar para Z–A)" : "Ordem Z–A (trocar para A–Z)"} title={asc ? "Ordem A–Z" : "Ordem Z–A"} onClick={() => setAsc(!asc)}>
            <span>{asc ? "A–Z" : "Z–A"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
          </button>
          <button type="button" className="iconbtn" aria-label="Exportar para Excel" title="Exportar para Excel" onClick={exportXlsx}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
        </div>
      </div>

      <div className="xscroll-top" ref={topRef} onScroll={() => sync("top")} aria-hidden="true" hidden={!overflow}>
        <div style={{ width: tblW }} />
      </div>
      <div className="table-wrap" ref={wrapRef} onScroll={() => sync("wrap")}>
        <table className="tbl clients" ref={tblRef}>
          <thead>
            <tr>
              <th className="freeze">Cliente</th>
              <th>Etapa</th>
              <th>Negócio</th>
              <th>Voo</th>
              <th>Hospedagem</th>
              <th>Seguro</th>
              <th className="num">{earnHeader}</th>
              <th>Observação</th>
              {companionExpId ? <th><span className="sr-only">Ação</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className={r.sub ? "subrow" : r.multi ? "grouptop" : undefined}>
                <td className="freeze">
                  {r.sub ? <span className="muted" aria-hidden="true">↳ </span> : null}
                  <span className="strong">{r.name}</span>
                  {r.sub ? <span className="sr-only"> (mesmo negócio do passageiro acima)</span> : null}
                  {r.email ? <div className="sub">{r.email}</div> : null}
                  {r.multi && companionExpId ? <div style={{ marginTop: 4 }}><span className="badge yellow">Vários passageiros no negócio</span></div> : null}
                  {r.matesTxt ? <div className="sub">{r.matesTxt}</div> : null}
                </td>
                <td>
                  <span className={`badge ${r.stage.tone} dot`}>{r.stage.label}</span>
                  {r.stage.sub ? <div className="sub">{r.stage.sub}</div> : null}
                </td>
                <td>
                  {r.deals.length
                    ? r.deals.map((d, i) => (
                        <span key={d.no}>
                          {i ? ", " : ""}
                          {d.url ? <a href={d.url} target="_blank" rel="noreferrer" title={`Abrir no HubSpot · ${d.stage}`}>{d.no}</a> : <span title={d.stage}>{d.no}</span>}
                        </span>
                      ))
                    : "—"}
                </td>
                {r.prods.map((p) => (
                  <ProductCell key={p.product} product={p.product} primary={p.primary} included={p.included} />
                ))}
                <td className="num strong">{r.com === null ? "—" : brl(r.com)}</td>
                <td>
                  {r.hsNote ? (
                    <button type="button" className="obs-btn" title={r.hsNote} aria-label={`Observação de ${r.name}`} onClick={() => setNoteKey(r.key)}>
                      <span className="obs-txt">{r.hsNote}</span>
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                {companionExpId ? (
                  <td>{r.multi ? <CompanionButton expId={companionExpId} personKey={r.key} name={r.name} /> : null}</td>
                ) : null}
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={companionExpId ? 9 : 8} className="empty">{rows.length ? "Nenhum cliente com esses filtros." : emptyText}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {noteRow ? <NoteModal row={noteRow} onClose={() => setNoteKey(null)} /> : null}
    </>
  );
}

// Vay: tira o passageiro da lista (não é da expedição). Vai para Conferidos; dá para desfazer lá.
function CompanionButton({ expId, personKey, name }: { expId: string; personKey: string; name: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const mark = () => {
    if (!window.confirm(`Marcar ${name} como acompanhante? Ele sai da lista de passageiros (e da visão do parceiro) e vai para Conferidos.`)) return;
    start(async () => {
      const r = await setPersonReviewed(expId, personKey, name, true, "acompanhante");
      setErr(r?.error ?? "");
    });
  };
  return (
    <>
      <button type="button" className="btn outline sm nowrap" disabled={pending} onClick={mark}>
        {pending ? "Salvando…" : "É acompanhante"}
      </button>
      {err ? <div className="sub" role="alert" style={{ color: "var(--red-700)" }}>{err}</div> : null}
    </>
  );
}

// Observação completa (campo "Observações para parceiro" do negócio no HubSpot)
function NoteModal({ row, onClose }: { row: TableRow; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="nt-title" onClose={onClose} style={{ width: "min(560px, calc(100vw - 32px))" }}>
      <div className="modal-head">
        <h2 id="nt-title" className="section-title">{row.name}</h2>
        <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <p className="small muted">
          {[row.email, row.phone].filter(Boolean).join(" · ") || "Sem contato"} · etapa: <strong>{row.stage.label}</strong>
        </p>
        <div className="note master">
          <span className="badge purple">Observação · HubSpot</span>
          <p style={{ whiteSpace: "pre-wrap", color: "var(--text-strong)" }}>{row.hsNote}</p>
        </div>
      </div>
    </dialog>
  );
}
