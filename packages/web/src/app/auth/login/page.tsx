import { LoginView } from "@/views/auth/login-view";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  return <LoginView callbackUrl={params.next} justReset={params.reset === "1"} />;
}
