import { getSession } from "@/lib/auth/session";

export default async function TeacherPage() {
  const session = await getSession();

  return (
    <main>
      <h1>Teacher dashboard</h1>
      <p>Signed in as {session?.user_id}.</p>
    </main>
  );
}
