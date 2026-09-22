"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh(); // Force a refresh to clear server state
  };

  return (
    <button 
      onClick={handleLogout}
      className="flex items-center px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
    >
      <LogOut className="w-4 h-4 mr-2" />
      Logout
    </button>
  );
}
