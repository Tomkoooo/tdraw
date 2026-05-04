import { WebPlugin } from "@capacitor/core";
export class PencilEnhancedWeb extends WebPlugin {
    async isAvailable() {
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
    async startHandwritingSession() {
        return { text: "" };
    }
    async cancelHandwritingSession() {
        // no-op
    }
    async recognizeInkImage() {
        return { text: "" };
    }
}
