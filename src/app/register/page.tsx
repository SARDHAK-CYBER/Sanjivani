"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Loader2, CheckCircle2, Lock, Camera } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PhoneOtp } from "@/components/PhoneOtp";
import { validatePassword } from "@/lib/password";
import { parseE164 } from "@/lib/phone";

/** Image preview read as a data URL: async (no synchronous setState in the effect) and nothing to revoke. */
function FilePreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return url ? <img src={url} className="w-full h-full object-cover" alt={alt} /> : null;
}

export default function RegisterPage() {
  const router = useRouter();
  
  // Registration Flow Step
  const [step, setStep] = useState(1); // 1 = Details, 2 = Phone verification (code by WhatsApp/SMS)

  // Basic Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [role, setRole] = useState("STUDENT"); // Default role
  const [rruIdNumber, setRruIdNumber] = useState("");

  // PII Fields
  const [bloodGroup, setBloodGroup] = useState("");
  const [allergies, setAllergies] = useState("None");
  const [contactNumber, setContactNumber] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  
  // Guardian Fields
  const [guardianRelation, setGuardianRelation] = useState("Father");
  const [guardianName, setGuardianName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  
  const [currentAddress, setCurrentAddress] = useState("");

  // Media
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [idCardPhoto, setIdCardPhoto] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const pwdError = validatePassword(password, { fullName, dob, email });
    if (pwdError) return setError(pwdError);
    if (!parseE164(contactNumber)) return setError("Enter a valid mobile number for \"My Contact\" (e.g. +91 98765 43210)");
    if (!parseE164(emergencyContact)) return setError("Enter a valid emergency contact number");
    if (!parseE164(guardianContact)) return setError("Enter a valid guardian contact number");
    if (!profilePhoto || !idCardPhoto) return setError("Please upload both a profile photo and an ID card photo");

    setStep(2);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "Photo upload failed");
    return data.url;
  };

  // Runs once the user has entered the code; `proof` is the single-use token the server re-checks.
  const handlePhoneVerified = async ({ proof }: { proof: string }) => {
    setLoading(true);
    setError("");

    try {
      const profilePhotoUrl = await uploadImage(profilePhoto!);
      const idCardPhotoUrl = await uploadImage(idCardPhoto!);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, fullName, role, rruIdNumber, dob,
          bloodGroup, allergies, contactNumber, emergencyContact,
          guardianRelation, guardianName, guardianContact, currentAddress,
          profilePhotoUrl, idCardPhotoUrl, phoneProof: proof,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Registration failed");
        setStep(1); // the SMS proof was consumed; fix the details and verify again
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6 transition-colors">
         <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Registration Successful</h2>
            <p className="text-gray-500 dark:text-gray-400">All data fully encrypted. On your first sign-in you will confirm your phone and set up an authenticator app. Redirecting to login...</p>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6 transition-colors py-12">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      
      <div className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 transition-colors">
        <div className="p-8 border-b border-gray-100 dark:border-gray-800 bg-gray-900 text-white text-center">
          <ShieldAlert className="w-12 h-12 mx-auto mb-2 text-red-500" />
          <h2 className="text-2xl font-bold">Sanjivani Identity Registration</h2>
          <p className="text-gray-400 text-sm mt-1">Create your secure, encrypted UII profile</p>
        </div>

        {step === 1 && (
          <form onSubmit={handleInitialSubmit} className="p-8 space-y-6">
            {error && <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg text-center">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Account & Profile */}
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">Account Info</h3>
                
                <div className="flex flex-col space-y-4 mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex flex-col items-center justify-center overflow-hidden border border-gray-300 dark:border-gray-700 flex-shrink-0">
                       {profilePhoto ? (
                         <FilePreview file={profilePhoto} alt="Profile" />
                       ) : (
                         <Camera className="w-6 h-6 text-gray-400" />
                       )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profile Photo *</label>
                      <input required type="file" accept="image/*" onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)} className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100" />
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                     <div className="w-16 h-12 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {idCardPhoto ? (
                          <FilePreview file={idCardPhoto} alt="ID Card" />
                        ) : (
                          <span className="text-[10px] font-bold text-blue-600">ID CARD</span>
                        )}
                     </div>
                     <div className="flex-1">
                       <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Card Photocopy *</label>
                       <input required type="file" accept="image/*" onChange={(e) => setIdCardPhoto(e.target.files?.[0] || null)} className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                     </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address *</label>
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
                  <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 chars, 1 number, 1 symbol" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  <p className="text-[10px] text-gray-500 mt-1 flex items-center"><Lock className="w-3 h-3 mr-1"/> Password will be securely hashed natively</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                    <input required type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth *</label>
                    <input required type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600">
                      <option value="STUDENT">Student</option>
                      <option value="STAFF">Staff</option>
                      <option value="SECURITY">Security</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RRU ID *</label>
                    <input required type="text" value={rruIdNumber} onChange={(e) => setRruIdNumber(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                </div>
              </div>

              {/* Right Column: Encrypted PII */}
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-gray-200 dark:border-gray-700 pb-2">
                   <h3 className="font-bold text-gray-900 dark:text-white">Emergency PII</h3>
                   <span className="text-[10px] text-green-600 font-bold bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded flex items-center">
                     <Lock className="w-3 h-3 mr-1"/> Encrypted At-Rest
                   </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Blood Group *</label>
                    <select required value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600">
                      <option value="">Select...</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allergies</label>
                    <input type="text" placeholder="None" value={allergies} onChange={(e) => setAllergies(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">My Contact *</label>
                    <input required type="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emerg. Contact *</label>
                    <input required type="tel" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                </div>

                <div className="space-y-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Primary Guardian Details *</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={guardianRelation} onChange={(e) => setGuardianRelation(e.target.value)} className="col-span-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600">
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Husband">Husband</option>
                      <option value="Wife">Wife</option>
                      <option value="Guardian">Guardian</option>
                    </select>
                    <input required type="text" placeholder="Full Name" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="col-span-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                  <input required type="tel" placeholder="Guardian Contact Number" value={guardianContact} onChange={(e) => setGuardianContact(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Address *</label>
                  <input required type="text" value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full py-4 px-4 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex justify-center items-center">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Continue to Phone Verification"}
            </button>
            
            <div className="text-center">
               <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                  Already have a profile? Sign In
               </Link>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="p-8 space-y-6 max-w-md mx-auto">
            {error && <div role="alert" className="p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">{error}</div>}

            <div className="text-center">
              <Lock className="w-14 h-14 text-red-500 mx-auto mb-3" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verify your mobile number</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                This number is your second sign-in factor, so we confirm it belongs to you before creating the account.
              </p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center py-6 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-2" />
                Creating your secure profile...
              </div>
            ) : (
              <PhoneOtp
                purpose="register"
                initialPhone={parseE164(contactNumber) ?? contactNumber}
                lockPhone
                sendLabel="Send code"
                verifyLabel="Verify & Register"
                onVerified={handlePhoneVerified}
              />
            )}

            <button type="button" onClick={() => { setStep(1); setError(""); }} className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
              Edit my details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
