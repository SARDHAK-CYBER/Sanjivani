"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The address QR codes should point at. Defaults to the site's own origin; set
 * NEXT_PUBLIC_QR_BASE_URL (e.g. http://192.168.1.20:3000) to test scanning from a phone on your LAN.
 * Empty during server rendering, then the real value on the client, without a setState-in-effect.
 */
export function useQrBaseUrl(): string {
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => ""
  );
  return (process.env.NEXT_PUBLIC_QR_BASE_URL || origin).replace(/\/+$/, "");
}
