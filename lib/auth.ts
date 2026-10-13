import { DEMO_COMPANY_ID } from "@/lib/data/seed";

export interface RequestContext {
  companyId: string;
  userId: string;
  role: "admin" | "finance_manager" | "collection_manager" | "viewer";
}

export function getRequestContext(request?: Request): RequestContext {
  return {
    companyId: request?.headers.get("x-company-id") || process.env.AERA_DEV_COMPANY_ID || DEMO_COMPANY_ID,
    userId: request?.headers.get("x-user-id") || "user-demo-manager",
    role: (request?.headers.get("x-user-role") as RequestContext["role"]) || "finance_manager",
  };
}

export function requireManager(context: RequestContext): void {
  if (!new Set(["admin", "finance_manager", "collection_manager"]).has(context.role)) {
    throw new Error("Insufficient permission");
  }
}
