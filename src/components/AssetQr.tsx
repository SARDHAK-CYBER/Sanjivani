"use client";

import { useRef } from "react";
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const PNG_SIZE = 1200; // px; a 1200 x ~1500 sticker prints sharply at A6/A5
const QR_PX = 900;

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "asset";

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function serialize(svg: SVGSVGElement, size: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  return new XMLSerializer().serializeToString(clone);
}

/**
 * A QR code for one asset with download buttons. Everything is rendered in the browser: the scan link contains
 * the secret asset ID and must not be sent to a third-party QR service.
 *  - PNG: a ready-to-print sticker (logo, QR, asset name, "scan in an emergency").
 *  - SVG: the bare code, for print shops and vector tools.
 */
export function AssetQr({ value, assetType, identifier, size = 128, className = "" }: { value: string; assetType: string; identifier: string; size?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const base = `sanjivani-qr-${slug(assetType)}-${slug(identifier)}`;

  const svgEl = () => box.current?.querySelector("svg") as SVGSVGElement | null;

  const downloadSvg = () => {
    const svg = svgEl();
    if (svg) save(new Blob([serialize(svg, QR_PX)], { type: "image/svg+xml" }), `${base}.svg`);
  };

  const downloadPng = async () => {
    const svg = svgEl();
    if (!svg) return;
    const qr = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialize(svg, QR_PX))}`);
    const logo = await loadImage("/logo.png").catch(() => null);

    const height = 1500;
    const canvas = document.createElement("canvas");
    canvas.width = PNG_SIZE;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PNG_SIZE, height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#111827";
    let y = 60;
    if (logo) {
      const logoH = 200;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, (PNG_SIZE - logoW) / 2, y, logoW, logoH);
      y += logoH + 30;
    }
    ctx.font = "bold 46px Arial, Helvetica, sans-serif";
    ctx.fillText("EMERGENCY QR  ·  SCAN TO HELP", PNG_SIZE / 2, y + 40);
    y += 80;

    ctx.imageSmoothingEnabled = false; // keep the modules crisp
    ctx.drawImage(qr, (PNG_SIZE - QR_PX) / 2, y, QR_PX, QR_PX);
    y += QR_PX + 70;

    ctx.font = "bold 54px Arial, Helvetica, sans-serif";
    ctx.fillText(identifier.slice(0, 40), PNG_SIZE / 2, y);
    y += 56;
    ctx.font = "36px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "#4b5563";
    ctx.fillText(assetType, PNG_SIZE / 2, y);

    canvas.toBlob((blob) => blob && save(blob, `${base}.png`), "image/png");
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div ref={box} className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
        <QRCodeSVG value={value} size={size} level="H" marginSize={1} />
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => void downloadPng()} className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Download className="w-3 h-3 mr-1" /> PNG
        </button>
        <button type="button" onClick={downloadSvg} className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Download className="w-3 h-3 mr-1" /> SVG
        </button>
      </div>
    </div>
  );
}
