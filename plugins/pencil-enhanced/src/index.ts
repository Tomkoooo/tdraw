import { registerPlugin } from "@capacitor/core";

import type { PencilEnhancedPlugin } from "./definitions";
import { PencilEnhancedWeb } from "./web";

export * from "./definitions";

export const PencilEnhanced = registerPlugin<PencilEnhancedPlugin>("PencilEnhanced", {
  web: () => new PencilEnhancedWeb(),
});
