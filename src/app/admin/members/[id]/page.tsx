"use client";
import React, { useState, useEffect } from "react";
import { ArrowLeft, Shield, Car, Activity, Lock, PhoneCall, AlertCircle, FileText, UserCircle, Download } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toCsv } from "@/lib/csv";
import type { AuditLogEntry, MemberProfile } from "@/lib/types";

export default function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/members/${unwrappedParams.id}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return setNotFound(true);
        setMember(await res.json());
      })
      .catch(() => !cancelled && setNotFound(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [unwrappedParams.id]);

  const filteredLogs = (member?.auditLogs ?? []).filter((log: AuditLogEntry) => {
    let match = true;
    if (actionFilter && log.action !== actionFilter) match = false;
    const logTime = new Date(log.createdAt).getTime();
    if (dateFrom && logTime < new Date(dateFrom).getTime()) match = false;
    if (dateTo && logTime > new Date(dateTo).getTime() + 86400000) match = false; // Add 1 day to include end date fully
    return match;
  });

  const exportToCSV = () => {
    if (filteredLogs.length === 0) return alert("No logs to export");
    // toCsv quotes every cell and defuses spreadsheet formulas (fingerprints come from a client header).
    const csvContent = toCsv([
      ["Timestamp", "Action Event", "Network (GeoID)", "Device Fingerprint"],
      ...filteredLogs.map((log) => [new Date(log.createdAt).toISOString(), log.action, log.geoId, log.deviceFingerprint]),
    ]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `audit_logs_${member?.uii}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Decrypting secure profile...</div>;
  if (notFound || !member) return <div className="p-8 text-center text-red-500">Member not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex items-center justify-between">
          <Link href="/admin/members" className="text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Directory
          </Link>
          <ThemeToggle />
        </div>

        {/* Header Profile */}
        <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-start space-x-6">
          <div className="w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-full border-4 border-white dark:border-gray-900 shadow-md flex items-center justify-center overflow-hidden flex-shrink-0">
             {member.profilePhotoUrl ? (
               <img src={member.profilePhotoUrl} className="w-full h-full object-cover" alt={member.fullName ?? "Member"} />
             ) : (
               <UserCircle className="w-16 h-16 text-gray-400" />
             )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{member.fullName}</h1>
                <p className="text-gray-500 dark:text-gray-400">{member.role} • {member.rruIdNumber}</p>
                {member.idCardPhotoUrl && (
                  <a href={member.idCardPhotoUrl} target="_blank" className="inline-flex items-center mt-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                    <FileText className="w-3 h-3 mr-1" /> View ID Card Photocopy
                  </a>
                )}
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-bold font-mono">
                  <Shield className="w-3 h-3 mr-1" /> UII: {member.uii}
                </span>
                <p className="text-xs text-gray-400 mt-1">Joined {new Date(member.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="block text-xs text-gray-500 mb-1">Email</span>
                <span className="font-medium text-gray-900 dark:text-white">{member.email}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="block text-xs text-gray-500 mb-1 flex items-center"><Lock className="w-3 h-3 mr-1 text-green-500"/> Date of Birth</span>
                <span className="font-medium text-gray-900 dark:text-white">{member.dob}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="block text-xs text-gray-500 mb-1 flex items-center"><Lock className="w-3 h-3 mr-1 text-green-500"/> Blood Group</span>
                <span className="font-medium text-red-600 dark:text-red-400">{member.bloodGroup}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="block text-xs text-gray-500 mb-1 flex items-center"><Lock className="w-3 h-3 mr-1 text-green-500"/> Personal Contact</span>
                <span className="font-medium text-gray-900 dark:text-white">{member.contactNumber}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Decrypted PII Section */}
        <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
           <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
             <Shield className="w-5 h-5 mr-2 text-green-600" /> Highly Secure PII (Decrypted)
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                 <div>
                   <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">Guardian Information</h3>
                   <div className="space-y-2">
                     <p><span className="text-gray-500 w-24 inline-block">Relation:</span> <span className="font-medium dark:text-white">{member.guardianRelation}</span></p>
                     <p><span className="text-gray-500 w-24 inline-block">Name:</span> <span className="font-medium dark:text-white">{member.guardianName}</span></p>
                     <p><span className="text-gray-500 w-24 inline-block">Contact:</span> <span className="font-medium dark:text-white">{member.guardianContact}</span></p>
                   </div>
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3 mt-6">Emergency Contact</h3>
                   <p className="font-medium text-red-600 dark:text-red-400 flex items-center"><PhoneCall className="w-4 h-4 mr-2"/> {member.emergencyContact}</p>
                 </div>
              </div>
              <div className="space-y-4">
                 <div>
                   <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">Medical & Address</h3>
                   <div className="space-y-2">
                     <p><span className="text-gray-500 w-24 inline-block flex items-start"><AlertCircle className="w-4 h-4 mr-1 text-orange-500"/> Allergies:</span> <span className="font-medium text-orange-600">{member.allergies}</span></p>
                     <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                       <p className="text-xs text-gray-500 mb-1">Current Address</p>
                       <p className="text-sm text-gray-900 dark:text-white">{member.currentAddress}</p>
                     </div>
                   </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Registered Assets & Vehicles */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center"><Car className="w-5 h-5 mr-2 text-blue-600" /> Registered Assets & Vehicles</h2>
          {member.assets.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm text-center text-gray-500">No assets registered to this member.</div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {member.assets.map((asset) => (
                <div key={asset.id} className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
                   <div className="flex justify-between items-center mb-4">
                     <div>
                       <h3 className="text-lg font-bold text-gray-900 dark:text-white">{asset.identifier}</h3>
                       <span className="text-sm text-gray-500">{asset.assetType} • QR Ref: {asset.qrReferenceId}</span>
                     </div>
                     <Link href={`/scan/${asset.qrReferenceId}`} target="_blank" className="text-blue-600 hover:underline text-sm flex items-center">
                       <FileText className="w-4 h-4 mr-1" /> View Public QR Page
                     </Link>
                   </div>
                   
                   {/* Photos Grid */}
                   <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                     {asset.frontPhotoUrl && <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border"><img src={asset.frontPhotoUrl} className="w-full h-full object-cover" alt=""/><div className="text-[10px] text-center bg-gray-800 text-white">Front</div></div>}
                     {asset.backPhotoUrl && <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border"><img src={asset.backPhotoUrl} className="w-full h-full object-cover" alt=""/><div className="text-[10px] text-center bg-gray-800 text-white">Back</div></div>}
                     {asset.leftPhotoUrl && <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border"><img src={asset.leftPhotoUrl} className="w-full h-full object-cover" alt=""/><div className="text-[10px] text-center bg-gray-800 text-white">Left</div></div>}
                     {asset.rightPhotoUrl && <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border"><img src={asset.rightPhotoUrl} className="w-full h-full object-cover" alt=""/><div className="text-[10px] text-center bg-gray-800 text-white">Right</div></div>}
                     {asset.rcPhotoUrl && <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border"><img src={asset.rcPhotoUrl} className="w-full h-full object-cover" alt=""/><div className="text-[10px] text-center bg-blue-600 text-white font-bold">RC Copy</div></div>}
                     {asset.devicePhotoUrl && <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border"><img src={asset.devicePhotoUrl} className="w-full h-full object-cover" alt=""/><div className="text-[10px] text-center bg-gray-800 text-white">Device</div></div>}
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Audit Logs */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-3 sm:space-y-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center"><Activity className="w-5 h-5 mr-2 text-red-600" /> Deep Security Audit Log</h2>
            <button onClick={exportToCSV} className="bg-gray-900 dark:bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center hover:bg-gray-800 dark:hover:bg-gray-700 transition">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </button>
          </div>
          
          {/* Filters */}
          <div className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 mb-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Action Type</label>
              <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 dark:text-white outline-none">
                <option value="">All Actions</option>
                {[...new Set((member.auditLogs ?? []).map((l) => l.action))].map((action) => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 dark:text-white outline-none" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 dark:text-white outline-none" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action Event</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Network (GeoID)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <span className="text-xs font-bold px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded-full border border-red-200 dark:border-red-800">{log.action}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">{log.geoId}</td>
                    <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate" title={log.deviceFingerprint ?? undefined}>{log.deviceFingerprint}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
