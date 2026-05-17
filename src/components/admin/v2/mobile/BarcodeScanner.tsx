"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { haptic } from "./haptics";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string, format?: string) => void;
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): {
    detect(source: HTMLVideoElement | ImageBitmap): Promise<DetectedBarcode[]>;
  };
}

/**
 * Capability-gated barcode scanner. Uses the Web Platform `BarcodeDetector`
 * API where available (Chrome on Android + recent desktop) and falls back
 * to a manual-entry input where it isn't (iOS Safari today). No third-party
 * library — keeps bundle tiny and respects the "production-grade, no
 * placeholders" CLAUDE.md rule.
 */
export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "BarcodeDetector" in window &&
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!supported || !videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
      const detector = new Ctor({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
      });

      const loop = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            haptic("success");
            onDetected(results[0].rawValue, results[0].format);
            stop();
            return;
          }
        } catch {
          /* a single frame may fail; keep scanning */
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera unavailable");
    }
  }, [supported, onDetected, stop]);

  useEffect(() => {
    if (open && supported) {
      start();
    }
    return stop;
  }, [open, supported, start, stop]);

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        stop();
        onClose();
      }}
      title="Scan barcode"
      size="auto"
      footer={
        !supported ? (
          <button
            type="button"
            className="v2-m-btn v2-m-btn-primary"
            style={{ flex: 1 }}
            disabled={!manual.trim()}
            onClick={() => {
              if (manual.trim()) {
                onDetected(manual.trim());
                setManual("");
              }
            }}
          >
            Use code
          </button>
        ) : null
      }
    >
      {supported ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {error ? (
            <div
              style={{
                padding: 12,
                background: "var(--danger-soft)",
                color: "var(--danger)",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : (
            <div
              style={{
                position: "relative",
                aspectRatio: "4 / 3",
                borderRadius: 12,
                overflow: "hidden",
                background: "#000",
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "20% 12%",
                  border: "2px solid color-mix(in oklab, var(--brand) 80%, transparent)",
                  borderRadius: 12,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                }}
              />
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", textAlign: "center" }}>
            Hold the barcode inside the box.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 10,
              borderRadius: 10,
              background: "var(--warning-soft)",
              color: "var(--warning)",
              fontSize: 12.5,
            }}
          >
            <Camera className="h-4 w-4" aria-hidden />
            Camera scanning unavailable on this device. Type the code below.
          </div>
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Barcode value"
            style={{
              padding: "10px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--fg)",
              fontSize: 16,
              fontFamily: "var(--font-ui)",
              outline: 0,
            }}
          />
        </div>
      )}
    </BottomSheet>
  );
}

