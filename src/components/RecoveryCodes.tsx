"use client";

import { useState } from "react";
import { Check, Copy, Download, KeyRound } from "lucide-react";

type Props = {
  codes: string[];
  onContinue: () => void;
  continueLabel?: string;
};

/**
 * Shows freshly generated recovery codes. They are displayed exactly once (only hashes are stored), so the
 * button that moves on stays disabled until the person confirms they have saved them.
 */
export function RecoveryCodes({ codes, onContinue, continueLabel = "Continue" }: Props) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the codes are still on screen and downloadable */
    }
  };

  const download = () => {
    const blob = new Blob([`Sanjivani recovery codes\nEach code works once. Keep them somewhere safe.\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sanjivani-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <KeyRound className="w-10 h-10 mx-auto text-red-600 mb-2" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Save your recovery codes</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          If you lose your phone or authenticator app, each of these codes lets you sign in <strong>once</strong>.
          They are shown only now.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-gray-900 dark:text-gray-100">
        {codes.map((code) => (
          <li key={code} className="text-center tracking-wider">{code}</li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button type="button" onClick={copy} className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center">
          {copied ? <Check className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />} {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={download} className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center">
          <Download className="w-4 h-4 mr-2" /> Download
        </button>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1" />
        I have saved these codes somewhere safe.
      </label>

      <button
        type="button"
        disabled={!saved}
        onClick={onContinue}
        className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
      >
        {continueLabel}
      </button>
    </div>
  );
}
