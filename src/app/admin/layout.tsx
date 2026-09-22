import Link from "next/link";
import { Users, Car, ShieldAlert, LayoutDashboard, FileText } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex transition-colors">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 hidden md:flex flex-col transition-colors">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-800">
          <ShieldAlert className="w-6 h-6 text-red-600 mr-2" />
          <span className="text-lg font-bold text-gray-900 dark:text-white">Sanjivani C2 Center</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <Link href="/admin" className="flex items-center px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <LayoutDashboard className="w-5 h-5 mr-3 text-gray-500 dark:text-gray-400" />
            Dashboard
          </Link>
          <Link href="/admin/members" className="flex items-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Users className="w-5 h-5 mr-3 text-gray-400" />
            Members
          </Link>
          <Link href="/admin/assets" className="flex items-center px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors">
            <Car className="w-5 h-5 mr-3" />
            Assets & QR
          </Link>
          <Link href="/admin/audits" className="flex items-center px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors">
            <FileText className="w-5 h-5 mr-3" />
            Audit Logs
          </Link>
          <Link href="/admin/incidents" className="flex items-center px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-100 dark:border-red-900/30">
            <ShieldAlert className="w-5 h-5 mr-3 animate-pulse" />
            Incidents
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 md:hidden transition-colors">
          <div className="flex items-center">
            <ShieldAlert className="w-6 h-6 text-red-600 mr-2" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">Sanjivani C2 Center</span>
          </div>
          <ThemeToggle />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
