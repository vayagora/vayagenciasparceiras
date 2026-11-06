"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CITIES } from "@/lib/cities";
import type { Partner } from "@/lib/types";
import { createExpedition } from "../actions";
import { Tip } from "@/components/ui";

export function NewExpeditionForm({ partners }: { partners?: Partner[] }) {
  const [state, action, pending] = useActionState(createExpedition, undefined);
  return (
    <section className="panel stack">
      <div className="ttl">
        <h2 className="section-title">Iniciar uma expedição</h2>
        <Tip>Informe o essencial. Depois você cadastra os clientes e a Vay Agora cuida do restante.</Tip>
      </div>
      <form action={action} className="form">
        <div className="form-grid">
          {partners ? (
            <div className="field">
              <label htmlFor="ne-partner">Parceiro</label>
              <select id="ne-partner" name="partner_id" className="select" required defaultValue="">
                <option value="" disabled>Escolha</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="ne-name">Nome da expedição</label>
            <input id="ne-name" name="name" className="input" placeholder="Ex.: Congresso Europeu de Cardiologia" required />
          </div>
          <div className="field">
            <label htmlFor="ne-city">Destino</label>
            <select id="ne-city" name="city" className="select" required defaultValue="">
              <option value="" disabled>Escolha o destino</option>
              {CITIES.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ne-date">Data de início</label>
            <input id="ne-date" name="start_date" type="date" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="ne-days">Duração (dias)</label>
            <input id="ne-days" name="days" type="number" min={1} max={365} className="input" required />
          </div>
        </div>
        {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
        <div className="row">
          <button type="submit" className="btn primary" disabled={pending}>Criar expedição</button>
          <Link href="/expedicoes" className="btn ghost">Cancelar</Link>
        </div>
      </form>
    </section>
  );
}
