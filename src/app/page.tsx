import Link from "next/link";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <ShieldAlert className="w-20 h-20 text-red-600 mb-6" />
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-gray-900 dark:text-white">
        Sanjivani <span className="text-red-600">Emergency Response</span>
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mb-10">
        A rapid, reliable, and secure system to assist university members in emergencies.
        Bystanders scan a QR code to instantly verify their identity, report incidents, and get life-saving information.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-8 py-4 text-base font-bold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition shadow-sm"
        >
          Sign in <ArrowRight className="ml-2 w-5 h-5" />
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center justify-center px-8 py-4 text-base font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition shadow-sm"
        >
          Register your identity
        </Link>
      </div>
      <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
        Administrators: sign in, and you will be taken to the C2 dashboard.
      </p>
    </div>
  );
}
