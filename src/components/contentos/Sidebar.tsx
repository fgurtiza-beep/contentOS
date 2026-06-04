"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useJobs } from "@/lib/contentos/store/useStore";
import { useRole } from "@/lib/contentos/store/uiStore";

const PRIMARY = [
  { href: "/contentos", label: "Dashboard", ico: "◧", exact: true },
  { href: "/contentos/jobs", label: "My Jobs", ico: "▦" },
  { href: "/contentos/review", label: "Human Review Queue", ico: "⚑", queueKey: "review" },
  { href: "/contentos/exports", label: "Exports", ico: "⤓" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const jobs = useJobs();
  const role = useRole();
  const reviewCount = jobs.filter((j) => j.state === "HUMAN_REVIEW" || j.state === "HELD").length;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <div className="sb-logo">
        <div className="mark">C</div>
        <div>
          <div className="name">ContentOS</div>
          <div className="sub">Sprout · IMD Studio</div>
        </div>
      </div>

      {/* Quick Access — the two most-used actions, highly visible */}
      <div className="sb-quick">
        <div className="label">Quick Access</div>
        <button className="qbtn new" onClick={() => router.push("/contentos/intake")}>
          <span className="qi">＋</span> New Content Job
        </button>
        <button className="qbtn qa" onClick={() => router.push("/contentos/qa-check")}>
          <span className="qi">✓</span> QA Check
        </button>
      </div>

      <nav className="sb-section">
        <div className="label">Workspace</div>
        {PRIMARY.map((n) => {
          const active = isActive(n.href, n.exact);
          return (
            <Link key={n.href} href={n.href} className={`sb-link ${active ? "active" : ""}`}>
              <span className="ico">{n.ico}</span>
              {n.label}
              {n.queueKey === "review" && reviewCount > 0 && <span className="badge">{reviewCount}</span>}
            </Link>
          );
        })}
      </nav>

      {role === "admin" && (
        <nav className="sb-section" style={{ marginTop: "auto" }}>
          <div className="label">Admin Insights</div>
          {[
            ["/contentos/admin", "Overview", "▤"],
            ["/contentos/admin?view=audit", "Audit Log", "❒"],
            ["/contentos/admin?view=jobs", "Job History", "🗂"],
            ["/contentos/admin?view=qa", "QA Analytics", "✓"],
          ].map(([href, label, ico]) => (
            <Link key={label} href={href} className={`sb-link ${pathname === "/contentos/admin" && label === "Overview" ? "active" : ""}`}>
              <span className="ico">{ico}</span>
              {label}
            </Link>
          ))}
        </nav>
      )}

      <div style={{ padding: 14, marginTop: role === "admin" ? 0 : "auto" }} className="faint tiny">
        Conductor over Production · Repurposing · QA. You submit requests; ContentOS routes them.
      </div>
    </aside>
  );
}
