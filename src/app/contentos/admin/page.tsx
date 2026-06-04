import { Suspense } from "react";
import { AdminInsights } from "@/components/contentos/AdminInsights";

export default function Page() {
  return (
    <Suspense fallback={<div className="content"><div className="empty">Loading insights…</div></div>}>
      <AdminInsights />
    </Suspense>
  );
}
