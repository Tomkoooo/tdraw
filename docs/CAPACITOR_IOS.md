# Capacitor iOS shell for tDraw

The web app stays the source of truth: the native shell is a **WKWebView** that loads your deployed HTTPS origin when `CAPACITOR_SERVER_URL` or `NEXTAUTH_URL` is set at `npx cap sync` time (see [`capacitor.config.ts`](../capacitor.config.ts)). The PWA build and `public/` assets are unchanged for browsers.

## Prerequisites

- Node 20+ and npm
- **macOS** with **Xcode** (not only Command Line Tools) and **CocoaPods** (`sudo gem install cocoapods`)
- Apple Developer Program membership for device installs beyond local debug

## Commands

```bash
npm install
# Build the local TypeScript plugin (runs automatically with cap:sync)
export CAPACITOR_SERVER_URL="https://your-staging-host.example"
npm run cap:sync
npm run cap:ios   # opens Xcode
```

In Xcode: select your team for **Signing & Capabilities**, choose a physical **iPad**, Run.

If you omit `CAPACITOR_SERVER_URL`, the WebView loads static files from [`www/`](../www/index.html) only (useful for smoke tests, not the full Next app).

## Internal distribution (no App Store review)

1. **TestFlight** (typical for internal testers): archive in Xcode → Distribute App → App Store Connect → TestFlight → add internal/external groups. Still uses Apple’s review for **first** build of a new app; subsequent builds are usually fast automated processing.

2. **Ad hoc**: register device UDIDs in the developer portal, create an **Ad Hoc** provisioning profile, export an `.ipa`, install via Apple Configurator, MDM, or a private link (users must trust the enterprise/ad hoc install flow).

3. **Apple Developer Enterprise Program**: distribute in-house IPAs signed with the enterprise certificate (MDM recommended). Not available on the standard paid developer account.

4. **MDM**: push the signed IPA or a manifest link to managed iPads.

Keep `NEXTAUTH_URL` / cookie `SameSite` settings aligned with the exact origin the WebView loads, or sign-in and Server Actions will fail.

## PencilEnhanced plugin

Swift sources live under [`plugins/pencil-enhanced/ios/Plugin/`](../plugins/pencil-enhanced/ios/Plugin/). After changing native code:

```bash
npm run cap:sync
```

Then build again in Xcode.

## Android parity

```bash
npm run cap:android
```

The same `CAPACITOR_SERVER_URL` applies. The `pencil-enhanced` plugin stubs return `available: false` on Android until you add Kotlin implementations.

## Troubleshooting

- **Pods / xcode-select errors**: install full Xcode, `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then `cd ios/App && pod install`.
- **ATS / cleartext**: HTTP dev servers require `cleartext: true` (already derived from `http://` URLs in config) and may need `NSAppTransportSecurity` exceptions in `Info.plist` for non-localhost hosts.
- **Server Actions blocked**: add your tunnel host to `allowedDevOrigins` / `serverActions.allowedOrigins` in [`next.config.ts`](../next.config.ts).
