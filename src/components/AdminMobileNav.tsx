"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, FileText, LayoutDashboard, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useAdminAlerts } from "@/components/AdminAlerts";

const ITEMS = [
  { href: "/admin", label: "Home", Icon: LayoutDashboard, exact: true },
  { href: "/admin/members", label: "Members", Icon: Users },
  { href: "/admin/assets", label: "Assets", Icon: Car },
  { href: "/admin/audits", label: "Audit", Icon: FileText },
  { href: "/admin/incidents", label: "Incidents", Icon: ShieldAlert },
];
const ADMINS_ITEM = { href: "/admin/admins", label: "Admins", Icon: ShieldCheck, exact: false };

/** Bottom tab bar for phones and small tablets: the sidebar is hidden below the md breakpoint. */
export function AdminMobileNav({ showAdmins = false }: { showAdmins?: boolean }) {
  const pathname = usePathname() ?? "";
  const { newIncidents } = useAdminAlerts();
  const items = showAdmins ? [...ITEMS, ADMINS_ITEM] : ITEMS;

  return (
    <nav aria-label="Admin" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pb-safe">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          const isIncidents = href === "/admin/incidents";
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-14 py-2 text-[11px] font-medium ${active || (isIncidents && newIncidents > 0) ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}
              >
                <Icon className={`w-5 h-5 ${isIncidents && newIncidents > 0 ? "animate-pulse" : ""}`} />
                {label}
                {isIncidents && newIncidents > 0 && (
                  <span className="absolute top-1 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] leading-4 text-center font-bold">{newIncidents}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
