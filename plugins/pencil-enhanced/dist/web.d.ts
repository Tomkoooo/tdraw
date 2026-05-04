import { WebPlugin } from "@capacitor/core";
import type { PencilAvailability, PencilEnhancedPlugin } from "./definitions";
export declare class PencilEnhancedWeb extends WebPlugin implements PencilEnhancedPlugin {
    isAvailable(): Promise<PencilAvailability>;
    startHandwritingSession(): Promise<{
        text: string;
    }>;
    cancelHandwritingSession(): Promise<void>;
    recognizeInkImage(): Promise<{
        text: string;
    }>;
}
