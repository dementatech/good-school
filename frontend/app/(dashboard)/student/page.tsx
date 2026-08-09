import { getSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function StudentPage() {
  const session = await getSession();

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Student dashboard</h1>
      <p className="text-sm text-muted-foreground">Signed in as {session?.user_id}.</p>

      <Card>
        <CardHeader>
          <CardTitle>Theme preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Same component code, no per-component theming" />
          <Button>Primary action</Button>
        </CardContent>
      </Card>
    </div>
  );
}
