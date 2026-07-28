import { getSession } from "@/lib/auth/session";

export default async function ParentPage() {
  const session = await getSession();

  return (
    <main>
      <h1>Parent dashboard</h1>
      <p>Signed in as {session?.user_id}.</p>
    </main>
  );
}
