import type { Tone } from "@/lib/commission";

export function Tip({ children, label = "Mais informações" }: { children: React.ReactNode; label?: string }) {
  return (
    <button type="button" className="tip" aria-label={label}>
      i<span className="tipbox" role="tooltip">{children}</span>
    </button>
  );
}

export function Badge({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return <span className={`badge ${tone}${dot ? " dot" : ""}`}>{children}</span>;
}

export function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`card kpi${accent ? " accent" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
