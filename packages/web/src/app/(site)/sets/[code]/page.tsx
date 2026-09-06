import { Suspense } from "react";
import { SetDetailView } from "@/views/sets/set-detail-view";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function SetPage({ params }: Props) {
  const { code } = await params;
  return (
    <Suspense>
      <SetDetailView code={code.toUpperCase()} />
    </Suspense>
  );
}
