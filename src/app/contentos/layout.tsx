import { Sidebar } from "@/components/contentos/Sidebar";
import { TopBar } from "@/components/contentos/TopBar";

export default function ContentOSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
