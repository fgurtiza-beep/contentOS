import { Suspense } from "react";
import { MyJobs } from "@/components/contentos/MyJobs";

export default function Page() {
  return (
    <Suspense fallback={<div className="content"><div className="empty">Loading jobs…</div></div>}>
      <MyJobs />
    </Suspense>
  );
}
