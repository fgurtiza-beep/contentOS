import { JobWorkspace } from "@/components/contentos/JobWorkspace";

export default function Page({ params }: { params: { id: string } }) {
  return <JobWorkspace id={params.id} />;
}
