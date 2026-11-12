"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { setPartnerAgreement } from "../../actions";

// Vay: acordo de parceria deste parceiro. Sem arquivo próprio, vale o padrão (Regras de Negócio Padrões).
export function AgreementManager({ partnerId, name }: { partnerId: string; name: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = (file: File) =>
    start(async () => {
      setMsg({});
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return setMsg({ error: "Envie um arquivo PDF." });
      if (file.size > 20 * 1024 * 1024) return setMsg({ error: "Arquivo maior que 20 MB." });
      const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `acordos/${partnerId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await createClient().storage.from("anexos").upload(path, file, { contentType: "application/pdf" });
      if (error) return setMsg({ error: "Não foi possível enviar o arquivo." });
      setMsg((await setPartnerAgreement(partnerId, path, file.name)) ?? {});
      if (fileRef.current) fileRef.current.value = "";
    });
  return (
    <section className="card pad stack">
      <h2 className="section-title">Acordo de parceria</h2>
      <p className="small muted">
        Em uso: <strong>{name ?? "Padrão · Regras de Negócio Padrões"}</strong>. É o documento que o parceiro abre no botão
        “Acordo de parceria”.
      </p>
      <div className="row" style={{ opacity: pending ? 0.6 : 1 }}>
        <a href={`/acordo-de-parceria?parceiro=${partnerId}`} target="_blank" rel="noreferrer" className="btn outline sm">Abrir</a>
        <label className="filebtn">
          {pending ? "Enviando…" : "Enviar outro PDF"}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" disabled={pending} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {name ? (
          <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(async () => setMsg((await setPartnerAgreement(partnerId, null, null)) ?? {}))}>
            Voltar ao padrão
          </button>
        ) : null}
      </div>
      {msg.error ? <div className="error" role="alert">{msg.error}</div> : null}
      {msg.ok ? <div className="notice" role="status">{msg.ok}</div> : null}
    </section>
  );
}
