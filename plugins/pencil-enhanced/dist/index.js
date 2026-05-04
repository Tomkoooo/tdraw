import { registerPlugin } from "@capacitor/core";
import { PencilEnhancedWeb } from "./web";
export * from "./definitions";
export const PencilEnhanced = registerPlugin("PencilEnhanced", {
    web: () => new PencilEnhancedWeb(),
});
