import Image from "next/image";

/** The Sanjivani mark on a white tile, so it stays legible on dark backgrounds too. */
export function Logo({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:ring-gray-700 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image src="/logo.png" alt="Sanjivani" width={size} height={size} priority className="h-full w-full object-contain" />
    </span>
  );
}
