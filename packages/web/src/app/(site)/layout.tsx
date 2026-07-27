import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { getMetafyBadges } from "@/features/metafy/badges";

export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isSupporter, isMember } = await getMetafyBadges();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <Navbar isSupporter={isSupporter} isMember={isMember} />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  );
}
