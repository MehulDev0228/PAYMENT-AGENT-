import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser, UserProfile } from "@/lib/auth/context";

// Route handlers wired to Supabase mode with a stubbed session and repository, to check that identity
// comes from the session and that headers cannot change company or role.
const ACME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";
const MANAGER = "44444444-4444-4444-8444-444444444444";
const TOKEN = "automation-secret-token";

const state = vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key", AERA_DATA_ADAPTER: "postgres",
    AERA_INTERNAL_API_TOKEN: "automation-secret-token", AERA_AUTOMATION_COMPANY_ID: "11111111-1111-4111-8111-111111111111",
  });
  return { session: null as SessionUser | null, profiles: new Map<string, UserProfile>() };
});
afterAll(() => {
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "AERA_DATA_ADAPTER", "AERA_INTERNAL_API_TOKEN", "AERA_AUTOMATION_COMPANY_ID"]) delete process.env[key];
});

const repo = vi.hoisted(() => ({
  overview: vi.fn(async (companyId: string) => ({ companyId })),
  decideAction: vi.fn(async () => ({ ok: true })),
  runDailyMonitor: vi.fn(async (companyId: string) => ({ companyId, reviewed: 0, created: 0, actions: [] })),
  listCases: vi.fn(async () => []),
  today: vi.fn(async () => "2026-09-27"),
  assignCase: vi.fn(async () => ({ ok: true })),
  logFollowUp: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/auth/supabase", () => ({ verifiedSessionUser: async () => state.session }));
vi.mock("@/lib/data", () => ({ repository: repo, sqlDatabase: () => ({}) }));
vi.mock("@/lib/data/users", () => ({ findUserProfile: async (_db: unknown, id: string) => state.profiles.get(id) ?? null }));

const overview = await import("@/app/api/collections/overview/route");
const approve = await import("@/app/api/collections/actions/[id]/approve/route");
const dailyMonitor = await import("@/app/api/automation/daily-monitor/route");
const exportRoute = await import("@/app/api/export/[report]/route");
const assign = await import("@/app/api/collections/cases/[id]/assign/route");
const followUps = await import("@/app/api/collections/cases/[id]/follow-ups/route");
const { proxy } = await import("@/proxy");

const SPOOF = { "x-company-id": OTHER, "x-user-id": MANAGER, "x-user-role": "admin" };
const params = Promise.resolve({ id: "action-1" });

beforeEach(() => {
  vi.clearAllMocks();
  state.session = null;
  state.profiles = new Map([
    [VIEWER, { id: VIEWER, companyId: ACME, role: "viewer", name: "Vik Viewer", email: "vik@acme.example" }],
    [MANAGER, { id: MANAGER, companyId: ACME, role: "finance_manager", name: "Asha Rao", email: "asha@acme.example" }],
  ]);
});

describe("API routes", () => {
  it("answer 401 without a session, even with identity headers", async () => {
    const response = await overview.GET(new Request("http://localhost/api/collections/overview", { headers: SPOOF }));
    expect(response.status).toBe(401);
    expect(repo.overview).not.toHaveBeenCalled();
  });

  it("read the session user's company, not x-company-id", async () => {
    state.session = { id: VIEWER };
    const response = await overview.GET(new Request("http://localhost/api/collections/overview", { headers: SPOOF }));
    expect(response.status).toBe(200);
    expect(repo.overview).toHaveBeenCalledWith(ACME);
  });

  it("keep viewers read-only even when they claim to be admin", async () => {
    state.session = { id: VIEWER };
    const response = await approve.POST(new Request("http://localhost/api/collections/actions/action-1/approve", { method: "POST", headers: SPOOF }), { params });
    expect(response.status).toBe(403);
    expect(repo.decideAction).not.toHaveBeenCalled();
  });

  it("record the signed-in manager as the approver", async () => {
    state.session = { id: MANAGER };
    const response = await approve.POST(new Request("http://localhost/api/collections/actions/action-1/approve", { method: "POST", headers: { "x-user-id": VIEWER } }), { params });
    expect(response.status).toBe(200);
    expect(repo.decideAction).toHaveBeenCalledWith(ACME, "action-1", "approved", MANAGER, undefined);
  });

  it("do not accept the automation token for human decisions", async () => {
    const response = await approve.POST(new Request("http://localhost/api/collections/actions/action-1/approve", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } }), { params });
    expect(response.status).toBe(401);
    expect(repo.decideAction).not.toHaveBeenCalled();
  });
});

describe("collector workflow routes", () => {
  const caseParams = Promise.resolve({ id: "case-1" });
  const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("let viewers export, scoped to their own company and identity", async () => {
    state.session = { id: VIEWER };
    const response = await exportRoute.GET(new Request("http://localhost/api/export/cases?assignee=me", { headers: SPOOF }), { params: Promise.resolve({ report: "cases" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="aera-cases-2026-09-27.xlsx"');
    expect(repo.listCases).toHaveBeenCalledWith(ACME, expect.objectContaining({ assignedTo: VIEWER }));
  });

  it("refuse exports without a session and unknown reports", async () => {
    expect((await exportRoute.GET(new Request("http://localhost/api/export/cases"), { params: Promise.resolve({ report: "cases" }) })).status).toBe(401);
    state.session = { id: VIEWER };
    expect((await exportRoute.GET(new Request("http://localhost/api/export/secrets"), { params: Promise.resolve({ report: "secrets" }) })).status).toBe(404);
  });

  it("keep assignment and follow-ups manager-only", async () => {
    state.session = { id: VIEWER };
    expect((await assign.POST(json("http://localhost/api/collections/cases/case-1/assign", { assigneeId: VIEWER }, SPOOF), { params: caseParams })).status).toBe(403);
    expect((await followUps.POST(json("http://localhost/api/collections/cases/case-1/follow-ups", { outcome: "reached" }, SPOOF), { params: caseParams })).status).toBe(403);
    expect(repo.assignCase).not.toHaveBeenCalled();
    expect(repo.logFollowUp).not.toHaveBeenCalled();
  });

  it("record the signed-in manager on assignments and follow-ups", async () => {
    state.session = { id: MANAGER };
    expect((await assign.POST(json("http://localhost/api/collections/cases/case-1/assign", { assigneeId: null }, { "x-user-id": VIEWER }), { params: caseParams })).status).toBe(200);
    expect(repo.assignCase).toHaveBeenCalledWith(ACME, "case-1", null, MANAGER);
    const response = await followUps.POST(json("http://localhost/api/collections/cases/case-1/follow-ups", { outcome: "no_answer", note: "Busy", nextFollowUpDate: "" }), { params: caseParams });
    expect(response.status).toBe(201);
    expect(repo.logFollowUp).toHaveBeenCalledWith(ACME, "case-1", { outcome: "no_answer", note: "Busy", nextFollowUpDate: undefined }, MANAGER);
  });

  it("reject malformed follow-ups before they reach the repository", async () => {
    state.session = { id: MANAGER };
    expect((await followUps.POST(json("http://localhost/api/collections/cases/case-1/follow-ups", { outcome: "shouted" }), { params: caseParams })).status).toBe(400);
    expect((await followUps.POST(json("http://localhost/api/collections/cases/case-1/follow-ups", { outcome: "reached", nextFollowUpDate: "tomorrow" }), { params: caseParams })).status).toBe(400);
    expect(repo.logFollowUp).not.toHaveBeenCalled();
  });
});

describe("automation routes", () => {
  const call = (headers: Record<string, string>) => dailyMonitor.POST(new Request("http://localhost/api/automation/daily-monitor", { method: "POST", headers }));

  it("run for the token's company", async () => {
    const response = await call({ authorization: `Bearer ${TOKEN}`, "x-company-id": ACME });
    expect(response.status).toBe(200);
    expect(repo.runDailyMonitor).toHaveBeenCalledWith(ACME);
  });

  it("refuse a wrong token or another company", async () => {
    expect((await call({ authorization: "Bearer guess" })).status).toBe(401);
    expect((await call({ authorization: `Bearer ${TOKEN}`, "x-company-id": OTHER })).status).toBe(403);
    expect(repo.runDailyMonitor).not.toHaveBeenCalled();
  });

  it("refuse viewers", async () => {
    state.session = { id: VIEWER };
    expect((await call({})).status).toBe(403);
  });
});

describe("proxy", () => {
  it("sends signed-out page requests to the login page", async () => {
    const response = await proxy(new NextRequest("http://localhost/cases?view=attention"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fcases%3Fview%3Dattention");
  });

  it("answers 401 for signed-out API calls and lets bearer calls through to the route", async () => {
    expect((await proxy(new NextRequest("http://localhost/api/customers"))).status).toBe(401);
    expect((await proxy(new NextRequest("http://localhost/api/automation/summary", { headers: { authorization: `Bearer ${TOKEN}` } }))).status).toBe(200);
  });

  it("leaves the public pages open", async () => {
    expect((await proxy(new NextRequest("http://localhost/"))).status).toBe(200);
    expect((await proxy(new NextRequest("http://localhost/login"))).status).toBe(200);
  });
});
