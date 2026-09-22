"use client";
import { useState, useEffect } from "react";
import { Plus, Eye, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  uii: string;
  fullName: string;
  role: string;
  rruIdNumber: string;
};

export default function MembersPage() {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const router = useRouter();

  const fetchMembers = async (searchQuery: string, pageNum: number) => {
    setLoading(true);
    const res = await fetch(`/api/members?search=${encodeURIComponent(searchQuery)}&page=${pageNum}&limit=10`);
    if (res.ok) {
      const result = await res.json();
      setMembers(result.data || []);
      setTotalPages(result.pagination?.totalPages || 1);
    }
    setLoading(false);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchMembers(search, page);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search, page]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Accounts Directory</h1>
        <Link 
          href="/register" target="_blank"
          className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-red-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" /> Invite User
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex flex-col sm:flex-row items-center gap-4 transition-colors">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by Name, UII, or RRU ID..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-x-auto transition-colors">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">UII</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">RRU ID</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {members.map(member => (
              <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer" onClick={() => router.push(`/admin/members/${member.id}`)}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900 dark:text-white">{member.uii || "N/A"}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{member.fullName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.role === 'STUDENT' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : member.role === 'ADMIN' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.rruIdNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                   <Link href={`/admin/members/${member.id}`} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center justify-end w-full">
                     <Eye className="w-4 h-4 mr-1" /> View Deep Profile
                   </Link>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-red-500" /> : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              <ChevronLeft className="w-4 h-4 dark:text-white" />
            </button>
            <button 
              disabled={page >= totalPages} 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              <ChevronRight className="w-4 h-4 dark:text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
