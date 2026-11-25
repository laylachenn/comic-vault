"use client";

import { useEffect, useRef, useState } from "react";
import { readComicBarcode, type ComicBarcode, type Pixels, type Reader } from "@/lib/barcode";

let readerPromise: Promise<Reader> | null = null;

/** Loads the barcode engine once, from this site (public/zxing) rather than a third-party server. */
function loadReader(): Promise<Reader> {
  if (!readerPromise) {
    readerPromise = (async () => {
      const zx = await import("zxing-wasm/reader");
      await zx.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path) },
        fireImmediately: true,
      });
      return ((img, options) => zx.readBarcodes(img as ImageData, options)) as Reader;
    })();
    readerPromise.catch(() => { readerPromise = null; });
  }
  return readerPromise;
}

function frameFrom(source: CanvasImageSource, crop: { x: number; y: number; w: number; h: number }, canvas: HTMLCanvasElement): Pixels {
  const scale = Math.min(1, 1600 / crop.w);
  canvas.width = Math.round(crop.w * scale);
  canvas.height = Math.round(crop.h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width, height, colorSpace: "srgb" };
}

/**
 * Live camera scanner with a photo fallback. Calls `onResult` once per barcode.
 * A live result counts only when two frames agree, so a misread add-on doesn't slip through.
 */
export function BarcodeScanner({ onResult }: { onResult: (b: ComicBarcode) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState("Starting the camera…");
  const [cameraError, setCameraError] = useState("");
  const [busyPhoto, setBusyPhoto] = useState(false);
  const done = useRef(false);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let last = "";
    const noAddOn = new Map<string, number>();
    canvas.current = document.createElement("canvas");

    const finish = (b: ComicBarcode) => {
      if (done.current) return;
      done.current = true;
      navigator.vibrate?.(60);
      resultRef.current(b);
    };

    async function tick(read: Reader) {
      if (stopped || done.current) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        // Read the middle band of the picture, where the guide box is.
        const w = v.videoWidth, h = v.videoHeight;
        const crop = { x: w * 0.05, y: h * 0.25, w: w * 0.9, h: h * 0.5 };
        try {
          const r = await readComicBarcode(read, frameFrom(v, crop, canvas.current!));
          if (r) {
            const key = `${r.main}|${r.addon ?? ""}`;
            if (r.addon) {
              if (key === last) return finish(r);
              last = key;
              setStatus("Hold still…");
            } else {
              const n = (noAddOn.get(r.main) ?? 0) + 1;
              noAddOn.set(r.main, n);
              setStatus("Found the barcode. Getting the small number beside it…");
              if (n >= 10) return finish(r); // about 2 seconds without the add-on: ask for the issue number instead
            }
          }
        } catch {
          // A frame that can't be read is normal; keep going.
        }
      }
      timer = setTimeout(() => tick(read), 180);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Live scanning needs a secure (https) connection. Take a photo of the barcode instead.");
        return;
      }
      try {
        const [read, s] = await Promise.all([
          loadReader(),
          navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } }),
        ]);
        stream = s;
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        setStatus("Point the camera at the barcode, including the small number to its right.");
        tick(read);
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setCameraError(
          name === "NotAllowedError" ? "Camera access is off for this site. Allow it in your browser settings, or take a photo of the barcode instead."
            : name === "NotFoundError" ? "No camera found. Take a photo of the barcode instead."
              : "The camera couldn't start. Take a photo of the barcode instead.",
        );
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function fromPhoto(file: File) {
    setBusyPhoto(true);
    setCameraError("");
    const url = URL.createObjectURL(file);
    try {
      const [read, img] = await Promise.all([loadReader(), (async () => { const i = new Image(); i.src = url; await i.decode(); return i; })()]);
      const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
      const scale = Math.min(1, 2400 / Math.max(full.w, full.h));
      const c = document.createElement("canvas");
      c.width = Math.round(full.w * scale);
      c.height = Math.round(full.h * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      const r = await readComicBarcode(read, { data, width, height, colorSpace: "srgb" });
      if (r) { done.current = true; onResult(r); }
      else setCameraError("No barcode found in that photo. Get closer so the barcode fills most of the picture, with good light and no glare.");
    } catch {
      setCameraError("That photo couldn't be read. Try a JPEG or PNG.");
    } finally {
      URL.revokeObjectURL(url);
      setBusyPhoto(false);
    }
  }

  return (
    <div className="scanner">
      {!cameraError ? (
        <div className="viewfinder">
          <video ref={video} playsInline muted autoPlay aria-label="Camera view" />
          <div className="guide" aria-hidden="true"><span /></div>
        </div>
      ) : (
        <p className="notice" role="alert">{cameraError}</p>
      )}
      {!cameraError ? <p className="hint" role="status">{status}</p> : null}
      <div className="actions">
        <label className="btn small" htmlFor="barcode-photo">{busyPhoto ? "Reading photo…" : "Use a photo instead"}</label>
        <input id="barcode-photo" className="file-hidden" type="file" accept="image/*" capture="environment" disabled={busyPhoto}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromPhoto(f); }} />
      </div>
    </div>
  );
}
