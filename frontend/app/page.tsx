import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/roles";
import { LandingPage } from "@/components/marketing/LandingPage";

export default async function Home() {
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.role]);
  return <LandingPage />;
}
