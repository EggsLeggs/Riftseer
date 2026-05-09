"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPasswordAction } from "@/features/auth/actions";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});

type Fields = z.infer<typeof schema>;

export function ForgotPasswordView() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);

  const { register, formState: { errors } } = useForm<Fields>({
    resolver: zodResolver(schema),
  });

  if (state?.ok) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If that email is registered, a password reset link has been sent.
          </p>
        </CardContent>
        <CardFooter>
          <Link href="/auth/login" className="text-sm underline underline-offset-4">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send a reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        {state?.error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <form action={action} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Link href="/auth/login" className="text-sm text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
