"use client";

// Tabela de clientes da expedição (protótipo v37): filtros, ordenação, Excel, etapa e responsável
// editáveis na linha (Vay), observação em uma linha e modal de comentários.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Tone } from "@/lib/commission";
import type { ClientComment, ManualStage, StageId } from "@/lib/types";
import { buildXlsx, slug, type Cell } from "@/lib/xlsx";
import { addClientComment, linkPassengerToClient, setClientOwner, setClientStage } from "../../actions";
import { ProductCell, type ProductDeal } from "./ProductCell";

type Product = "voo" | "hotel" | "seguro";

export type TableRow = {
  key: string;
  clientId: string | null; // null = linha sem cliente cadastrado (negócio do HubSpot)
  warn: boolean;
  people: { name: string; suffix?: string; contact: string }[];
  hiddenTxt?: string;
  tag?: { label: string; tone: Tone };
  stage: { id: StageId; label: string; tone: Tone; editable: boolean; manual: ManualStage };
  owner: { id: string | null; name: string; editable: boolean };
  dealNos: string[];
  prods: { product: Product; primary: ProductDeal[]; included: ProductDeal[]; hasDeal: boolean }[];
  com: number | null; // null = "—" (valor está na linha principal de outro passageiro)
  hsNote: string;
  comments: ClientComment[]; // os que este usuário pode ver (o parceiro só recebe os públicos)
  email: string;
  phone: string;
  // Vay: passageiros de negócio do HubSpot que não foram ligados a um cliente da lista (botão "Vincular")
  link?: { passengers: { id: string; name: string }[] };
};

export type Option = { value: string; label: string };

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    .format(new Date(iso))
    .replace(",", "");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// O que aparece na coluna Observação: a do HubSpot ou o último comentário público; +N para os demais.
function obsOf(r: TableRow) {
  const pub = r.comments.filter((c) => !c.internal);
  if (r.hsNote) return { src: "HubSpot", text: r.hsNote, more: r.comments.length };
  const last = pub[pub.length - 1];
  if (last) return { src: "", text: last.body, more: r.comments.length - 1 };
  return { src: "", text: "", more: r.comments.length };
}

export function ClientsTable({
  rows,
  isVay,
  earnHeader,
  stageOptions,
  manualStageOptions,
  vayUsers,
  expName,
  emptyText,
  initialClient,
  linkClients = [],
}: {
  rows: TableRow[];
  isVay: boolean;
  earnHeader: string;
  stageOptions: Option[];
  manualStageOptions: Option[];
  vayUsers: Option[];
  expName: string;
  emptyText: string;
  initialClient?: string;
  linkClients?: Option[]; // clientes da expedição, para o "Vincular"
}) {
  const [q, setQ] = useState("");
  const [fStage, setFStage] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [asc, setAsc] = useState(true);
  const [openId, setOpenId] = useState<string | null>(initialClient ?? null);

  const ownerOptions: Option[] = useMemo(() => {
    const people = isVay
      ? vayUsers
      : [...new Set(rows.map((r) => r.owner.name).filter(Boolean))].map((n) => ({ value: n, label: n }));
    return [{ value: "", label: "Todos os responsáveis" }, { value: "-", label: "Sem responsável" }, ...people];
  }, [isVay, vayUsers, rows]);

  const shown = useMemo(() => {
    const term = fold(q.trim());
    const list = rows.filter((r) => {
      if (term) {
        const names = r.people.map((p) => fold(p.name)).join(" ");
        const deals = r.dealNos.join(" ").replace(/#/g, "");
        if (!names.includes(term) && !deals.includes(term.replace(/#/g, ""))) return false;
      }
      if (fStage && r.stage.id !== fStage) return false;
      if (fOwner === "-" && (r.owner.id || r.owner.name)) return false;
      if (fOwner && fOwner !== "-" && (isVay ? r.owner.id : r.owner.name) !== fOwner) return false;
      return true;
    });
    const name = (r: TableRow) => fold(r.people[0]?.name ?? "");
    return list.sort((a, b) => (asc ? 1 : -1) * name(a).localeCompare(name(b), "pt-BR"));
  }, [rows, q, fStage, fOwner, asc, isVay]);

  const filtered = !!(q.trim() || fStage || fOwner);
  const open = rows.find((r) => r.clientId === openId) ?? null;
  const [linkKey, setLinkKey] = useState<string | null>(null);
  const linking = rows.find((r) => r.key === linkKey) ?? null;

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
    const header = ["Cliente", "E-mail", "Telefone", "Etapa", "Responsável", "Negócio(s)", "Voo", "Hospedagem", "Seguro", earnHeader, "Observação"];
    const data: Cell[][] = shown.map((r) => {
      const prod = (k: Product) => {
        const p = r.prods.find((x) => x.product === k);
        if (!p) return null;
        const v = p.primary.reduce((a, x) => a + (x.value ?? 0), 0);
        if (v > 0) return Math.round(v * 100) / 100;
        return p.included.length ? `Incluído no ${p.included.map((x) => x.no).join(", ")}` : null;
      };
      const obs = [
        r.hsNote ? `HubSpot: ${r.hsNote}` : "",
        ...r.comments.map((c) => `${c.internal ? "[Interno] " : ""}${when(c.created_at)} ${c.author_name}: ${c.body}`),
      ]
        .filter(Boolean)
        .join("\n");
      return [
        r.people.map((p) => p.name + (p.suffix ?? "")).join(" / "),
        r.email,
        r.phone,
        r.stage.label,
        r.owner.name,
        r.dealNos.join(", "),
        prod("voo"),
        prod("hotel"),
        prod("seguro"),
        r.com === null ? null : Math.round(r.com * 100) / 100,
        obs,
      ];
    });
    const bytes = buildXlsx("Clientes", header, data, [32, 30, 20, 22, 22, 18, 14, 14, 14, 16, 60]);
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
        <select className="select cell-sel" aria-label="Filtrar por responsável" value={fOwner} onChange={(e) => setFOwner(e.target.value)} style={{ minWidth: 190 }}>
          {ownerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="small muted">{shown.length} de {rows.length} {rows.length === 1 ? "cliente" : "clientes"}</span>
        {filtered ? (
          <button type="button" className="btn ghost sm" onClick={() => { setQ(""); setFStage(""); setFOwner(""); }}>
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
              <th>Responsável</th>
              <th>Negócio</th>
              <th>Voo</th>
              <th>Hospedagem</th>
              <th>Seguro</th>
              <th className="num">{earnHeader}</th>
              <th>Observação</th>
              {isVay ? <th><span className="sr-only">Comentários</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Row key={r.key} r={r} isVay={isVay} manualStageOptions={manualStageOptions} vayUsers={vayUsers} onOpen={setOpenId} onLink={setLinkKey} />
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={isVay ? 10 : 9} className="empty">{rows.length ? "Nenhum cliente com esses filtros." : emptyText}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? <CommentsModal row={open} isVay={isVay} onClose={() => setOpenId(null)} /> : null}
      {isVay && linking?.link ? <LinkDialog row={linking} clients={linkClients} onClose={() => setLinkKey(null)} /> : null}
    </>
  );
}

function Row({
  r,
  isVay,
  manualStageOptions,
  vayUsers,
  onOpen,
  onLink,
}: {
  r: TableRow;
  isVay: boolean;
  manualStageOptions: Option[];
  vayUsers: Option[];
  onOpen: (id: string) => void;
  onLink: (key: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const save = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      const res = await fn();
      setErr(res?.error ?? "");
    });
  const o = obsOf(r);
  const full = [r.hsNote ? `HubSpot: ${r.hsNote}` : "", ...r.comments.filter((c) => isVay || !c.internal).map((c) => c.body)]
    .filter(Boolean)
    .join("\n\n");
  return (
    <tr className={r.warn ? "warn" : undefined} style={{ opacity: pending ? 0.6 : 1 }}>
      <td className="freeze">
        {r.people.map((p, i) => (
          <div key={i}>
            <span className="strong">{p.name}</span>
            {p.suffix ? <span className="sub">{p.suffix}</span> : null}
            {p.contact ? <div className="sub">{p.contact}</div> : null}
          </div>
        ))}
        {r.hiddenTxt ? <div className="sub">{r.hiddenTxt}</div> : null}
        {r.tag ? <div style={{ marginTop: 4 }}><span className={`badge ${r.tag.tone}`}>{r.tag.label}</span></div> : null}
        {err ? <div className="sub" role="alert" style={{ color: "var(--red-700)" }}>{err}</div> : null}
      </td>
      <td>
        {r.stage.editable && r.clientId ? (
          <select
            className="select cell-sel"
            aria-label={`Etapa de ${r.people[0]?.name}`}
            value={r.stage.manual}
            disabled={pending}
            onChange={(e) => save(() => setClientStage(r.clientId!, e.target.value))}
            style={{ minWidth: 168 }}
          >
            {manualStageOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        ) : (
          <span className={`badge ${r.stage.tone} dot`}>{r.stage.label}</span>
        )}
      </td>
      <td>
        {r.owner.editable && r.clientId ? (
          <select
            className="select cell-sel"
            aria-label={`Responsável por ${r.people[0]?.name}`}
            value={r.owner.id ?? ""}
            disabled={pending}
            onChange={(e) => save(() => setClientOwner(r.clientId!, e.target.value || null))}
            style={{ minWidth: 150 }}
          >
            <option value="">Sem responsável</option>
            {vayUsers.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        ) : (
          r.owner.name || <span className="muted">—</span>
        )}
      </td>
      <td>{r.dealNos.length ? r.dealNos.join(", ") : "—"}</td>
      {r.prods.map((p) => (
        <ProductCell key={p.product} product={p.product} primary={p.primary} included={p.included} hasDeal={p.hasDeal} canEdit={isVay} />
      ))}
      <td className="num strong">{r.com === null ? "—" : brl(r.com)}</td>
      <td>
        {!o.text && !o.more ? (
          <span className="muted">—</span>
        ) : r.clientId ? (
          <button type="button" className="obs-btn" title={full} aria-label={`Comentários de ${r.people[0]?.name}`} onClick={() => onOpen(r.clientId!)}>
            {o.src ? <span className="obs-src">{o.src}</span> : null}
            <span className="obs-txt">{o.text || "Ver comentários"}</span>
            {o.more > 0 ? <span className="obs-more">+{o.more}</span> : null}
          </button>
        ) : (
          <span className="obs-btn static" title={full}>
            <span className="obs-txt">{o.text}</span>
          </span>
        )}
      </td>
      {isVay ? (
        <td>
          {r.clientId ? (
            <button type="button" className="iconbtn" aria-label={`Comentários de ${r.people[0]?.name}`} title="Comentários" onClick={() => onOpen(r.clientId!)}>+</button>
          ) : r.link?.passengers.length ? (
            <button type="button" className="btn outline sm" title="Ligar este passageiro a um cliente da lista" onClick={() => onLink(r.key)}>
              Vincular
            </button>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

function CommentsModal({ row, isVay, onClose }: { row: TableRow; isVay: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [row.comments.length]);
  const comments = isVay ? row.comments : row.comments.filter((c) => !c.internal);
  const add = () =>
    start(async () => {
      const r = (await addClientComment(row.clientId!, draft, internal)) ?? {};
      setMsg(r);
      if (r.ok) setDraft("");
    });
  const name = row.people[0]?.name ?? "";
  return (
    <dialog ref={ref} className="modal" aria-labelledby="cm-title" onClose={onClose} style={{ width: "min(620px, calc(100vw - 32px))" }}>
      <div className="modal-head">
        <h2 id="cm-title" className="section-title">{name}</h2>
        <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <p className="small muted">
          {[row.email, row.phone].filter(Boolean).join(" · ") || "Sem contato"} · etapa hoje: <strong>{row.stage.label}</strong> · responsável:{" "}
          <strong>{row.owner.name || "ninguém ainda"}</strong>
        </p>
        {row.hsNote ? (
          <div className="note master">
            <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span className="badge purple">HubSpot · observação principal</span>
              <span className="small muted">Campo “Observações para parceiro” do negócio</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap", color: "var(--text-strong)" }}>{row.hsNote}</p>
          </div>
        ) : null}
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Comentários · {comments.length}</span>
          <div className="stack thread" ref={listRef} style={{ gap: 8 }}>
            {comments.map((c) => (
              <div key={c.id} className={`note${c.internal ? " internal" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span className="small">
                    <strong style={{ color: "var(--text-strong)" }}>{c.author_name}</strong> <span className="muted">· {c.author_email}</span>
                  </span>
                  <span className="row small muted" style={{ gap: 8 }}>
                    <span className={`badge ${c.internal ? "neutral" : "purple"}`}>{c.internal ? "Interno" : "Para o parceiro"}</span>
                    {when(c.created_at)}
                  </span>
                </div>
                <p style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
              </div>
            ))}
            {comments.length === 0 ? <p className="small muted">Nenhum comentário ainda.</p> : null}
          </div>
        </div>
        {isVay && row.clientId ? (
          <>
            <div className="field">
              <label htmlFor="cm-new">Novo comentário</label>
              <textarea id="cm-new" className="textarea" placeholder="Escreva um comentário" value={draft} onChange={(e) => setDraft(e.target.value)} />
            </div>
            {msg.error ? <div className="error" role="alert">{msg.error}</div> : null}
            {msg.ok ? <div className="notice" role="status">{msg.ok}</div> : null}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row" role="group" aria-label="Quem vê o comentário" style={{ gap: 6 }}>
                <button type="button" className={`btn sm ${internal ? "outline" : "secondary"}`} aria-pressed={!internal} onClick={() => setInternal(false)}>
                  Para o parceiro
                </button>
                <button type="button" className={`btn sm ${internal ? "secondary" : "outline"}`} aria-pressed={internal} onClick={() => setInternal(true)}>
                  Interno · só a Vay
                </button>
              </div>
              <button type="button" className="btn primary" disabled={pending || !draft.trim()} onClick={add}>
                {pending ? "Salvando…" : "Adicionar comentário"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}

// Vay: escolhe o cliente da lista que é este passageiro do HubSpot. O sistema grava no cliente o contato do
// HubSpot e, na próxima atualização da tela, as duas linhas viram uma.
function LinkDialog({ row, clients, onClose }: { row: TableRow; clients: Option[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const ps = row.link?.passengers ?? [];
  const [pid, setPid] = useState(ps[0]?.id ?? "");
  const [cid, setCid] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const save = () =>
    start(async () => {
      const r = (await linkPassengerToClient(pid, cid)) ?? {};
      setMsg(r);
      if (r.ok) ref.current?.close();
    });
  return (
    <dialog ref={ref} className="modal" aria-labelledby="lk-title" onClose={onClose} style={{ width: "min(480px, calc(100vw - 32px))" }}>
      <div className="modal-head">
        <h2 id="lk-title" className="section-title">Vincular a um cliente</h2>
        <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <p className="small muted">
          Use quando o passageiro do HubSpot é um cliente da lista, mas o sistema não reconheceu (contato, e-mail, telefone e nome
          diferentes). O contato do HubSpot fica gravado no cliente e o vínculo fica registrado nos comentários internos.
        </p>
        {ps.length > 1 ? (
          <div className="field">
            <label htmlFor="lk-p">Passageiro do HubSpot</label>
            <select id="lk-p" className="select" value={pid} onChange={(e) => setPid(e.target.value)}>
              {ps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ) : (
          <p className="small">Passageiro do HubSpot: <strong>{ps[0]?.name}</strong></p>
        )}
        <div className="field">
          <label htmlFor="lk-c">Cliente da lista</label>
          <select id="lk-c" className="select" value={cid} onChange={(e) => setCid(e.target.value)}>
            <option value="">Escolha o cliente</option>
            {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {msg.error ? <div className="error" role="alert">{msg.error}</div> : null}
        <div className="row">
          <button type="button" className="btn primary" disabled={pending || !pid || !cid} onClick={save}>
            {pending ? "Vinculando…" : "Vincular"}
          </button>
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancelar</button>
        </div>
      </div>
    </dialog>
  );
}
