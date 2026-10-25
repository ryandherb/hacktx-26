import { Nunito_Sans } from "next/font/google";

// Closest free match to Toyota's proprietary "Toyota Type". Scoped to the dashboard only.
const toyotaLike = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className={toyotaLike.className}>{children}</div>;
}
