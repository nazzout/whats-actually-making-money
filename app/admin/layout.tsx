import "./admin.css";

export const metadata = { title: "Owner | What makes money?", robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>;
}
