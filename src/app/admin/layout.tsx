import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Sud Italia",
  robots: "noindex, nofollow",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-bg">
      {children}
    </div>
  );
}
