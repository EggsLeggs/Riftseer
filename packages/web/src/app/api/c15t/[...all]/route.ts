import { getC15t } from "@/lib/c15t";

function handler(req: Request) {
  return getC15t().handler(req);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
