import { Suspense } from "react";
import { JobIntakeForm } from "@/components/contentos/JobIntakeForm";

export default function Page() {
  return (
    <Suspense>
      <JobIntakeForm />
    </Suspense>
  );
}
