import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TopBar } from "@/components/TopBar";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "teacher") {
    redirect("/login");
  }

  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
