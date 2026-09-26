"use client";

import { useRef } from "react";
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// The poster template (public/qr-template.jpg) is 1080 x 1350. It is drawn at 2x so the QR modules stay crisp;
// the blank middle of the template, between the headline and the "Scan using Camera" pill, holds the code.
const TEMPLATE = { src: "/qr-template.jpg", width: 1080, height: 1350, scale: 2 };
const CARD = { x: 250, y: 398, w: 580, h: 588 }; // white card, in template pixels
const QR_PX = 500; // QR size inside the card, in template pixels
const SVG_PX = 900;

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
 *  - Poster: the Sanjivani/RRU poster template with this asset's QR code centred on it (PNG).
 *  - SVG: the bare code, for print shops and vector tools.
 */
export function AssetQr({ value, assetType, identifier, size = 128, className = "" }: { value: string; assetType: string; identifier: string; size?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const base = `sanjivani-poster-${slug(assetType)}-${slug(identifier)}`;

  const svgEl = () => box.current?.querySelector("svg") as SVGSVGElement | null;

  const downloadSvg = () => {
    const svg = svgEl();
    if (svg) save(new Blob([serialize(svg, SVG_PX)], { type: "image/svg+xml" }), `${base.replace("poster", "qr")}.svg`);
  };

  const downloadPng = async () => {
    const svg = svgEl();
    if (!svg) return;
    const k = TEMPLATE.scale;
    const [template, qr] = await Promise.all([
      loadImage(TEMPLATE.src),
      loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialize(svg, QR_PX * k))}`),
    ]);

    const canvas = document.createElement("canvas");
    canvas.width = TEMPLATE.width * k;
    canvas.height = TEMPLATE.height * k;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

    // White card so the code keeps its quiet zone and contrast against the gradient.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(CARD.x * k, CARD.y * k, CARD.w * k, CARD.h * k, 28 * k);
    ctx.fill();
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = "#1554a0";
    ctx.stroke();

    const qrX = CARD.x + (CARD.w - QR_PX) / 2;
    ctx.imageSmoothingEnabled = false; // keep the modules crisp
    ctx.drawImage(qr, qrX * k, (CARD.y + 22) * k, QR_PX * k, QR_PX * k);

    ctx.imageSmoothingEnabled = true;
    ctx.textAlign = "center";
    ctx.fillStyle = "#111827";
    ctx.font = `bold ${30 * k}px Arial, Helvetica, sans-serif`;
    ctx.fillText(`${assetType} · ${identifier}`.slice(0, 34), (CARD.x + CARD.w / 2) * k, (CARD.y + CARD.h - 22) * k);

    canvas.toBlob((blob) => blob && save(blob, `${base}.png`), "image/png");
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div ref={box} className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
        <QRCodeSVG value={value} size={size} level="H" marginSize={1} />
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => void downloadPng()} className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Download className="w-3 h-3 mr-1" /> Poster
        </button>
        <button type="button" onClick={downloadSvg} className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Download className="w-3 h-3 mr-1" /> SVG
        </button>
      </div>
    </div>
  );
}
