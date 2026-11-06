"use client";

import { useActionState } from "react";
import { syncNow } from "../actions";

export function SyncButton({ last }: { last: string }) {
  const [state, action, pending] = useActionState(syncNow, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "Sincronizando…" : "Sincronizar com HubSpot"}
      </button>
      <span className="small muted">{last}</span>
      {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
      {state?.ok ? <div className="notice" role="status">{state.ok}</div> : null}
    </form>
  );
}
