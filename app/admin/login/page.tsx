import type { Metadata } from "next";
import { Button, Field, Input } from "@/components/ui";

export const metadata: Metadata = {
  title: "Siftag pop-up admin",
  robots: { index: false, follow: false },
};

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-900">
      <form
        action="/api/admin/login"
        method="post"
        className="w-full max-w-sm"
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Siftag pop-up
        </p>
        <h1 className="mt-3 font-display text-3xl">Admin</h1>

        <div className="mt-8">
          <Field
            label="Password"
            error={error ? "That password didn't match." : undefined}
          >
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              required
              invalid={Boolean(error)}
            />
          </Field>
        </div>

        <input type="hidden" name="next" value={next ?? "/admin"} />

        <div className="mt-6">
          <Button full type="submit">
            Sign in
          </Button>
        </div>
      </form>
    </main>
  );
}
