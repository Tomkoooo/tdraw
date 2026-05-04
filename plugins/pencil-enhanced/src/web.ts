import { WebPlugin } from "@capacitor/core";

import type { PencilAvailability, PencilEnhancedPlugin } from "./definitions";

export class PencilEnhancedWeb extends WebPlugin implements PencilEnhancedPlugin {
  async isAvailable(): Promise<PencilAvailability> {
    return {
      available: false,
      platform: "web",
      features: {
        doubleTap: false,
        handwritingModal: false,
        squeeze: false,
      },
    };
  }

  async startHandwritingSession(): Promise<{ text: string }> {
    return { text: "" };
  }

  async cancelHandwritingSession(): Promise<void> {
    // no-op
  }

  async recognizeInkImage(): Promise<{ text: string }> {
    return { text: "" };
  }
}
