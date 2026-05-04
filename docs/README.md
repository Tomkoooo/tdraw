# tDraw documentation

Short index into the docs that ship with the repo. The **canonical** setup, features, env vars, and user-facing behavior are in the **[root README](../README.md)**.

| Doc | Purpose |
|-----|---------|
| [README.md](../README.md) | Full feature list, self-hosting, env vars, realtime modes, PWA install, **Capacitor** workflow, **Apple Pencil / Excalidraw** behavior |
| [CAPACITOR_IOS.md](./CAPACITOR_IOS.md) | Native shell: prerequisites, `cap sync` + server URL, Xcode / TestFlight / distribution, **PencilEnhanced** plugin paths, Android notes, troubleshooting |
| [LICENSE](./LICENSE) | MIT license text |

## Stack (high level)

- **Next.js** (App Router) and **React** for the web app  
- **MongoDB** + **Auth.js (NextAuth v5)** for users and sessions  
- **Excalidraw** (`@excalidraw/excalidraw`) for the drawing canvas  
- **Capacitor 6** (`ios/`, `android/`) for optional native wrappers; **`pencil-enhanced`** local plugin for iOS PencilKit / double-tap (see root README and `CAPACITOR_IOS.md`)

For local dev, Docker, and Google OAuth, follow the root README — it stays updated with the current scripts in `package.json`.
