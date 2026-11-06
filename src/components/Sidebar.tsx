"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

type Item = { href: string; label: string; count?: number };

export function Sidebar({ isVay, name, email }: { isVay: boolean; name: string; email: string }) {
  const path = usePathname();
  const items: Item[] = isVay
    ? [
        { href: "/visao-geral", label: "Visão geral" },
        { href: "/expedicoes", label: "Expedições" },
        { href: "/parceiros", label: "Parceiros" },
      ]
    : [
        { href: "/painel", label: "Painel" },
        { href: "/expedicoes", label: "Expedições" },
      ];
  return (
    <aside className={`sidebar ${isVay ? "vay" : "parceiro"}`}>
      <div className="brand">
        <Image src="/brand/logo-tipografico-porcelana.png" alt="Vay Agora" width={150} height={45} style={{ width: 150, height: "auto" }} priority />
        <span>{isVay ? "Painel interno" : "Portal da agência"}</span>
      </div>
      <nav aria-label="Menu principal">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className="navlink" aria-current={path.startsWith(it.href) ? "page" : undefined}>
            {it.label}
          </Link>
        ))}
      </nav>
      <div className="me">
        <div>
          <div className="name">{name}</div>
          <div className="mail">{email}</div>
        </div>
        <form action={logout}>
          <button type="submit" className="logout">Sair</button>
        </form>
      </div>
    </aside>
  );
}
