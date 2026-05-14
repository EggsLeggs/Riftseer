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
import { registerAction } from "@/features/auth/actions";

const schema = z.object({
  username: z.string().min(1, { message: "Display name is required" }).max(50),
  handle: z
    .string()
    .min(3, { message: "Handle must be at least 3 characters" })
    .max(30, { message: "Handle must be 30 characters or fewer" })
    .regex(/^[a-z0-9_]+$/, { message: "Only lowercase letters, numbers, and underscores" })
    .transform((v) => v.toLowerCase()),
  email: z.string().email({ message: "Enter a valid email" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
});

type Fields = z.infer<typeof schema>;

export function RegisterView() {
  const [state, action, pending] = useActionState(registerAction, null);

  const { register, formState: { errors } } = useForm<Fields>({
    resolver: zodResolver(schema),
  });

  if (state?.pending) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{state.message}</p>
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
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Sign up with your email and password.</CardDescription>
      </CardHeader>
      <CardContent>
        {state?.error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <form action={action} className="space-y-4">
          <div className="flex gap-2 rounded-md border p-3 text-sm leading-snug">
            <input
              id="accepted_terms"
              name="accepted_terms"
              type="checkbox"
              required
              className="mt-0.5 size-4 shrink-0 accent-primary"
              aria-describedby="accepted_terms_description"
            />
            <label htmlFor="accepted_terms" id="accepted_terms_description" className="cursor-pointer">
              I agree to the{" "}
              <Link href="/terms" className="underline underline-offset-4" target="_blank">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-4" target="_blank">
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="username">Display name</Label>
            <Input
              id="username"
              type="text"
              autoComplete="name"
              aria-invalid={!!errors.username}
              {...register("username")}
            />
            {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="handle">Username</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm select-none">
                @
              </span>
              <Input
                id="handle"
                type="text"
                autoComplete="username"
                className="pl-7"
                aria-invalid={!!errors.handle}
                {...register("handle")}
              />
            </div>
            {errors.handle
              ? <p className="text-xs text-destructive">{errors.handle.message}</p>
              : <p className="text-xs text-muted-foreground">Your unique handle — letters, numbers, underscores</p>
            }
          </div>
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
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
