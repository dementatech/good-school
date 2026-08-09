"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { createSchool, type School } from "@/lib/api/schools";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SchoolAdminsPanel } from "./SchoolAdminsPanel";

const STEPS = ["School details", "First admin"] as const;

export function SchoolOnboarding() {
  const router = useRouter();
  const [school, setSchool] = useState<School | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminCreated, setAdminCreated] = useState(false);

  const step = school ? 1 : 0;

  async function handleCreateSchool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const created = await createSchool(name.trim());
      setSchool(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the school.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <ol className="flex items-center text-sm">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  index < step
                    ? "bg-primary text-primary-foreground"
                    : index === step
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-muted-foreground",
                )}
              >
                {index < step ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>
              <span className={index === step ? "font-medium" : "text-muted-foreground"}>
                {label}
              </span>
            </span>
            {index < STEPS.length - 1 && <span className="mx-3 h-px w-8 bg-border" />}
          </li>
        ))}
      </ol>

      {!school ? (
        <Card>
          <CardHeader>
            <CardTitle>School details</CardTitle>
            <CardDescription>Start with the school&apos;s name — you can add more later.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSchool} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="school-name">School name</Label>
                <Input
                  id="school-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Kampala High School"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create school"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{school.name} created</CardTitle>
              <CardDescription>
                Now add its first admin — they&apos;ll use this to sign in and set up the
                school&apos;s academic structure and students.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SchoolAdminsPanel schoolId={school.id} onAdminCreated={() => setAdminCreated(true)} />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant={adminCreated ? "default" : "outline"}
              onClick={() => router.push("/super-admin/schools")}
            >
              {adminCreated ? "Done" : "Finish without adding an admin"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
