import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/ui";

const LINKS = [["#product", "Product"], ["#how", "How it works"], ["#controls", "Controls"], ["#faq", "FAQ"]];

export function SiteNav() {
  return (
    <div className="fixed inset-x-0 top-3 z-50 px-3 md:top-4 md:px-6">
      <nav aria-label="Main" className="glass-nav mx-auto flex h-14 max-w-[1180px] items-center justify-between rounded-2xl pl-5 pr-2">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map(([href, label]) => <li key={href}><a href={href} className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white">{label}</a></li>)}
        </ul>
        <div className="flex items-center gap-1.5">
          <Link href="/dashboard" className="hidden rounded-lg px-3 py-2 text-[13.5px] font-medium text-white/80 transition-colors hover:text-white sm:block">Sign in</Link>
          <Link href="/dashboard" className="btn-light min-h-10">Open the demo</Link>
          <details className="group relative md:hidden">
            <summary className="grid size-10 list-none place-items-center rounded-lg text-white/80 hover:bg-white/10 [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu size={19} /></summary>
            <ul className="glass-nav absolute right-0 top-12 w-52 rounded-xl p-2">
              {LINKS.map(([href, label]) => <li key={href}><a href={href} className="block rounded-lg px-3 py-2.5 text-sm text-white/85 hover:bg-white/10">{label}</a></li>)}
            </ul>
          </details>
        </div>
      </nav>
    </div>
  );
}
