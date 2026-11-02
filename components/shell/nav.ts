import { BookOpen, Bot, Building2, CalendarCheck, FileUp, Gauge, HandCoins, ListChecks, Settings2, ShieldCheck, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavCountKey = "approvals" | "review" | "attention";
export interface NavItem { href: string; label: string; icon: LucideIcon; count?: NavCountKey }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Get paid", items: [
    { href: "/dashboard", label: "Today", icon: Gauge },
    { href: "/cases", label: "Unpaid bills", icon: ListChecks, count: "attention" },
    { href: "/approvals", label: "Needs you", icon: ShieldCheck, count: "approvals" },
    { href: "/promises", label: "Pay dates", icon: CalendarCheck },
  ] },
  { label: "Money", items: [
    { href: "/payments", label: "Money in", icon: HandCoins, count: "review" },
    { href: "/customers", label: "Customers", icon: Building2 },
    { href: "/imports", label: "Upload", icon: FileUp },
  ] },
  { label: "Settings & help", items: [
    { href: "/ask", label: "Ask KindlyPay", icon: Bot },
    { href: "/automation", label: "Auto reminders", icon: Workflow },
    { href: "/policy", label: "Rules", icon: Settings2 },
    { href: "/guide", label: "How it works", icon: BookOpen },
  ] },
];

export type NavCounts = Record<NavCountKey, number>;
