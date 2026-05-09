import type { ReactNode } from "react";
import ConsentManagerClient from "./provider";

export function ConsentManager({ children }: { children: ReactNode }) {
  return <ConsentManagerClient>{children}</ConsentManagerClient>;
}
