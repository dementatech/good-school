import { getSession } from "@/lib/auth/session";

export default async function AdminPage() {
  const session = await getSession();

  return (
    <main>
      <h1>Admin dashboard</h1>
      <p>Signed in as {session?.user_id}.</p>
    </main>
  );
}
