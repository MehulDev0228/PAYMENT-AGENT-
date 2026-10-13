import { Bot, Building2, FileUp, Gauge, HandCoins, Inbox, ListChecks, Settings2, ShieldCheck, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavCountKey = "approvals" | "review" | "attention";
export interface NavItem { href: string; label: string; icon: LucideIcon; count?: NavCountKey }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Collect", items: [
    { href: "/dashboard", label: "Overview", icon: Gauge },
    { href: "/cases", label: "Cases", icon: ListChecks, count: "attention" },
    { href: "/approvals", label: "Approvals", icon: ShieldCheck, count: "approvals" },
    { href: "/promises", label: "Promises", icon: Inbox },
  ] },
  { label: "Reconcile", items: [
    { href: "/payments", label: "Payments", icon: HandCoins, count: "review" },
    { href: "/customers", label: "Customers", icon: Building2 },
    { href: "/imports", label: "Imports", icon: FileUp },
  ] },
  { label: "Operate", items: [
    { href: "/ask", label: "Ask AERA", icon: Bot },
    { href: "/automation", label: "Automation", icon: Workflow },
    { href: "/policy", label: "Policy & controls", icon: Settings2 },
  ] },
];

export type NavCounts = Record<NavCountKey, number>;
