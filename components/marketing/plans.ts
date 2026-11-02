/** Plans shown on the pricing section and the sign-up page. Prices in INR per month, before 18% GST. */
export interface Plan {
  key: "starter" | "growth" | "business" | "enterprise";
  name: string;
  tagline: string;
  monthly: number | null;
  yearlyMonthly: number | null;
  limit: string;
  setup: string;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  { key: "starter", name: "Starter", tagline: "For small businesses", monthly: 11999, yearlyMonthly: 9999, limit: "Up to 100 customers", setup: "₹25,000 one-time setup",
    features: ["Polite auto reminders", "Pay dates tracked", "Upload bills (4 columns)", "3 team members", "Email support"] },
  { key: "growth", name: "Growth", tagline: "For growing companies", monthly: 35999, yearlyMonthly: 29999, limit: "Up to 500 customers", setup: "₹75,000 one-time setup", highlight: true,
    features: ["Everything in Starter", "“Needs you” approvals", "Bank payment matching", "Ask KindlyPay", "Send from your own Gmail", "10 team members"] },
  { key: "business", name: "Business", tagline: "For multi-branch firms", monthly: 83999, yearlyMonthly: 69999, limit: "Up to 2,000 customers", setup: "₹2,00,000 one-time setup",
    features: ["Everything in Growth", "Multiple companies", "Tally, Zoho and SAP connections", "Single sign-on", "Audit export", "Priority support"] },
  { key: "enterprise", name: "Private", tagline: "Runs on your own servers", monthly: null, yearlyMonthly: null, limit: "Unlimited customers", setup: "Installed on your servers",
    features: ["Your data never leaves your office", "AI optional, or fully off", "Your own database and email", "Dedicated support person", "Custom agreement"] },
];
