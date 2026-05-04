import type { PluginListenerHandle } from "@capacitor/core";

export type PencilDoubleTapPayload = {
  /** Raw `UIPencilPreferredAction` when available (iOS); -1 if unknown */
  preferredAction: number;
};

export type PencilSqueezePayload = {
  phase: "began" | "changed" | "ended" | "unknown";
};

export type PencilAvailability = {
  available: boolean;
  platform: "ios" | "android" | "web";
  features: {
    doubleTap: boolean;
    handwritingModal: boolean;
    squeeze: boolean;
  };
};

export interface PencilEnhancedPlugin {
  isAvailable(): Promise<PencilAvailability>;

  /**
   * iOS: presents PencilKit modal; resolves when user taps **Insert text** (OCR) or rejects on Cancel.
   * Web/Android: resolves `{ text: "" }`.
   */
  startHandwritingSession(options?: { locale?: string }): Promise<{ text: string }>;

  /** Dismiss an in-flight native modal without resolving `startHandwritingSession`. */
  cancelHandwritingSession(): Promise<void>;

  /** OCR an image patch (data URL or base64) and return recognized text. */
  recognizeInkImage(options: { imageBase64: string; locale?: string }): Promise<{ text: string }>;

  addListener(
    eventName: "pencilDoubleTap",
    listenerFunc: (payload: PencilDoubleTapPayload) => void,
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: "pencilSqueeze",
    listenerFunc: (payload: PencilSqueezePayload) => void,
  ): Promise<PluginListenerHandle>;
}
