import { getSession } from "@/lib/auth/session";

export default async function TeacherPage() {
  const session = await getSession();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Teacher dashboard</h1>
        <p className="text-sm text-muted-foreground">Signed in as {session?.user_id}.</p>
      </div>
    </div>
  );
}
