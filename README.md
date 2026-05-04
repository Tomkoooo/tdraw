# tDraw: Premium iPad-First Note-Taking PWA

> The incredibly fast, absolutely beautiful, and fully self-hostable note-taking Progressive Web App designed purposefully for iPad and Apple Pencil — with an optional **Capacitor** native shell for iOS and Android when you want a store-ready or MDM-distributed build.

tDraw is a clean, minimalist notebook application with **sharing**, **organizations**, **folders**, **tasks & calendar**, **live collaboration**, and **per-user toolbar customization**. Drawing uses **Excalidraw** in the browser or WebView. Your notes stay yours, with strict access checks on every server action and realtime join.

---

## Features

- **Google sign-in** with MongoDB-backed users.
- **Advanced sharing**: invite collaborators by email with roles **Reader**, **Editor**, or **Author**; optional **allow forward share**; per-invite expiry (**24h–7d** in the share sheet) or fall back to **`INVITE_TTL_HOURS`** (default 48h). Invites appear under **Shared with me**; signing in with the invited email auto-attaches pending invites.
- **Organizations**: each user may create **one** organization but can belong to **many**; members (**Admin / Member / Guest**) with invites and role management; **org-wide sheets** visible to all members according to role.
- **Folders**: personal and org folder trees; **folder ACLs** (`hidden`, `view`, `read_only`, `full`) for org folders and optional personal folder ACLs for other users.
- **Dashboard (iPad-first)**: segments **Drive / Shared / Orgs / Trash**; **Shared** splits into **Shared with me** and **Shared by me**; unified search; **sort** (A–Z, newest, last updated) with **folders first** then notes (root notes before items filed in folders); **pin** notes and folders; **per-note menu** (share, rename, pin, info, move to trash); **storage meters** for personal drive and the active org; **⋯** menu: **Settings**, sign out. **Global bottom dock** (all signed-in routes except the canvas): **Tasks**, **Calculator**, **New note** (center FAB: personal note; on `/dashboard` also **New folder…**), **Calendar** — plus bottom safe-area padding so content clears the bar.
- **Trash**: soft-deleted notes and personal folders can be **restored** or **permanently deleted** from the Trash segment.
- **Tasks (Kanban)**: **Trello-style boards** for **personal** and **per-organization** workspaces — drag cards across columns (**To Do / In Progress / Done** + custom lists), **labels**, **descriptions**, **due dates**, **assignees** (self, a member, or whole org), and **comments**. Same row-level checks as before (`requireOrgMember`, task ownership).
- **Calendar (Outlook-style)**: **FullCalendar** **month / week / day** with a **sidebar** to toggle **personal** and **each org** calendar; create events with **title, time, location, description**, **reminders**, **guest emails**, and **org participant** pickers; data merges **personal + selected org** views. Creators can rename/delete.
- **Note information**: from the dashboard **⋯** menu, **Information** opens a **glass modal** (server `getSheetInfo`) with **owner**, **last saved by**, **your role**, **org** (if any), **shares**, **dates**, **approximate size**, and **version** — no browser `alert()`.
- **Org presence & live editing**: **Socket.io** `joinOrg` / `org:presence` shows **who is online** on the **Orgs** segment; **`org:docActivity`** marks org notes **being edited** (name + pulse) in the grid/list and on **Kanban-style** cards. On **org-linked notes**, the canvas can show **collaborators on this note** (join + avatars) and a compact **Org online** strip.
- **Floating calculator** (global): **math.js** expression mode, **touch-friendly number pad** (toggleable, **on by default** for iPad), **history**, **copy result**, draggable/resizable **glass** window — opened from the **global dock** (or the **floating FAB** while on a **note** only), available on **tasks, calendar, settings, dashboard**, etc. On the **canvas**, **Import / Export / Share / Settings** sit **under the title and page controls** in the top glass card; **long-press** on the canvas (Select/Hand) still opens the calculator.
- **Hotbar preferences**: drag-and-reorder tools and add/remove from a palette on **Settings**; stored per user in MongoDB (`User.hotbarToolIds`).
- **Theme**: **System / light / dark** with a header toggle and smooth palette transitions (`data-theme` on the document root).
- **Realtime**: **Socket.io** for **presence**, **remote cursors**, **snapshot broadcast**, **`joinOrg` / `leaveOrg`** (org-wide **online avatars** and **who is editing which org note**), and **sheet room** joins with **signed tokens**. In production Docker, **Next.js and Socket.io share one process and port (3000)** via [`server/prod.cjs`](server/prod.cjs) (built from [`server/prod.entry.ts`](server/prod.entry.ts)). The client loads `/api/realtime-config` (empty URL = same origin). Room join uses **HMAC-signed short tokens** from `getRealtimeToken`. **MongoDB Change Streams** (`ENABLE_CHANGE_STREAMS=1`) are optional and **require a MongoDB replica set** — a typical single-node self-hosted MongoDB **does not** provide replica-set semantics, so leave this unset; collaboration still works over Socket.io.
- **Offline-friendly saves**: failed saves are queued in **IndexedDB** (localforage) and retried when the device is back online.

---

## User Guide: How to Use tDraw

### Dashboard

After sign-in you land on a **single-screen dashboard** with segments (**Drive**, **Shared**, **Orgs**, **Trash**):

1. **Drive** — storage strip, **folders** row (with pin + drag reorder), **sort** and search, grid/list, drag to reorder notes, **⋯ on each card** for share/rename/pin/**information (glass modal)**/trash. Use the **global +** (bottom bar) for a **new personal note** or **New folder** (when you are on `/dashboard`).
2. **Shared** — **Shared with me** (role badges) and **Shared by me** (notes you have invited others to); same view modes as Drive.
3. **Orgs** — create **one** org (if you have not already), pick an org chip, **who is online** (avatars), **org storage** line, **Manage members**, reorder org notes (admins/creators get the note **⋯** menu), **live “being edited”** hints on cards when someone has that org note open, and **+** for org notes when that org is active.
4. **Trash** — restore or permanently delete trashed personal notes and folders.

**Tasks**, **Calendar**, **Calculator**, and **+** (new note) sit on the **global bottom bar** whenever you are signed in (hidden on an open **note** so the canvas stays clear). **Settings**, **theme**, and **Sign out** live under the **⋯** menu (top right on the dashboard).

### Notes & permissions

- **Auto-save** debounces to the server (and broadcasts over Socket.io when the app is running with realtime enabled).
- **Readers** see the canvas in **view-only** mode (Excalidraw read-only). **Editors** and **Authors** can draw; **Authors** may invite others if **allow forward share** was granted.
- **Org admins** may delete any sheet in the org (not only their own).

### Sharing

1. Open a sheet you own (or have share rights on).
2. Tap **Share** (bottom glass toolbar), enter an email, pick a **role**, **link expiry** (24h–7d), optionally allow forward share, and **Send invite**.
3. With **SMTP** configured (`SMTP_HOST`, etc.), the server sends the invite by email. If SMTP is not configured, the server **logs** the invite URL to the console instead.
4. The recipient opens the link (`/invite/sheet/...`), signs in with the **same email**, and is placed on the note.

### Drawing & toolbar

The canvas is **edge-to-edge**; a **glass card** above the safe area holds **back**, the **title**, optional **page navigation**, then **PDF import**, **PDF export**, **Share**, and **Settings** in a row below. **Excalidraw** provides the drawing surface and tool UI at the bottom. Chrome **fades while you draw** on the canvas and returns after you lift the pointer. Use the **global calculator** (FAB on the note, or long-press on the canvas in Select/Hand).

Customize the **dashboard hotbar** under **Settings** (drag order, add/remove).

### Apple Pencil, stylus, and native iOS

On the **note Settings** sheet (same glass area as Share / Import), an **Apple Pencil** section appears when you can edit:

- **Double-tap** (Capacitor **iOS** only, via the `pencil-enhanced` plugin): choose **Toggle pen / eraser**, **Undo**, **Handwriting → text** (opens Apple **PencilKit**; inserted as text on the canvas), or **No action**. On web or Android, these controls still persist for when you use a native build.
- **Write → text**: opens the native handwriting modal on **Capacitor iOS** (same as the handwriting double-tap path).
- **Scribble erase gesture**: when enabled, a tight zig-zag “scribble” stroke with the pen or mouse can delete intersecting shapes (heuristic; see `src/lib/native/scribbleErase.ts`).
- **Pencil-only (block finger paint)**: ignores finger down events for painting when you want stylus-first input.
- **Excalidraw pen mode**: maps drawing to the stylus for better palm rejection alongside iOS system behavior.

Capacitor loads your real app from a **hosted HTTPS URL** when `CAPACITOR_SERVER_URL`, `NEXT_PUBLIC_CAPACITOR_SERVER_URL`, or `NEXTAUTH_URL` is set at sync time (see [`capacitor.config.ts`](capacitor.config.ts)). Without that, the shell only shows the placeholder in [`www/index.html`](www/index.html). Full workflow, Xcode, TestFlight, and auth alignment are in **[`docs/CAPACITOR_IOS.md`](docs/CAPACITOR_IOS.md)** (Android commands are there too; the plugin stubs **PencilEnhanced** on Android until you add Kotlin support).

### Calculator

- From most pages, tap **Calculator** in the **global bottom bar**. On a **note**, use the **floating calculator** button (when the window is closed) or **long-press** on the canvas (~0.5s) in **Select** or **Hand**.
- Use the **number pad** for large, touch-friendly entry (toggle with the **keyboard** icon in the title bar; **visible by default**). You can still type **math.js** expressions in the field (e.g. `sqrt(2)`, `sin(45 deg)`, `2^10`), press **Evaluate** or **⌘/Ctrl+Enter**, then **Copy result** to the clipboard (and canvas hook when wired).
- **History** rows are tappable to reload an expression; drag the header or resize from the corner handle.

### Offline

If the network drops, edits keep local state; failed saves are queued and flushed when connectivity returns. For full PWA caching, extend [`public/sw.js`](public/sw.js) (stub today).

### Touch and global UI (troubleshooting)

- **Bottom dock:** Shown when you are signed in and the path is under **`/dashboard`** or **`/settings`** (hidden on **`/sheet/...`** notes; there, use the **floating calculator** FAB and canvas long-press per the Calculator section above). While the session is still **`loading`**, the dock also mounts on those paths so the bar does not vanish during hydration.
- **Full-screen scrims** (⋯ menu, **New note** FAB backdrop) use a **high z-index** so they sit above other fixed UI; they **close on navigation** and when you tap outside. If taps feel “dead,” dismiss any open menu first.
- **Canvas:** A single capture-phase pointer handler handles chrome fade + calculator long-press; it ignores taps on the sheet chrome, share sheet, and import/export busy overlay so drawing and buttons stay reliable on iPad and desktop.

---

## Self-Hosting

### Prerequisites

- **Node.js 20+**
- **MongoDB** (single instance is fine; **replica set only needed** if you intentionally enable `ENABLE_CHANGE_STREAMS=1`)
- **Google OAuth** credentials
- Optional: **SMTP** for invitation email; **Docker** for compose deployments

### Environment variables

Create `.env.local`:

```env
MONGODB_URI=mongodb://localhost:27017/tdraw
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_SECRET=your-random-strong-auth-secret-here

# Used in invitation links (set in production)
NEXTAUTH_URL=http://localhost:3000

# If you expose the app through ngrok (or any reverse proxy) with `next start`, set the public
# HTTPS origin here and enable trusted host so Auth.js accepts X-Forwarded-* from the tunnel:
# NEXTAUTH_URL=https://YOUR-SUBDOMAIN.ngrok-free.app
# AUTH_TRUST_HOST=true
# Google Cloud Console → Web client → Authorized redirect URIs must include:
#   https://YOUR-SUBDOMAIN.ngrok-free.app/api/auth/callback/google
# and Authorized JavaScript origins: https://YOUR-SUBDOMAIN.ngrok-free.app
# (Restart the Node process after changing .env — NEXTAUTH_URL must match the URL in the browser.)
#
# **Next.js dev + ngrok:** With `npm run dev`, Next blocks requests whose browser origin is not
# the dev hostname unless tunnel hosts are allowlisted. `next.config.ts` sets `allowedDevOrigins`
# and `serverActions.allowedOrigins` for common `*.ngrok-*` hosts. For other tunnels, add comma-
# separated host patterns: `ALLOWED_DEV_ORIGINS=*.trycloudflare.com,*.loca.lt`

# SMTP (Nodemailer) — optional; without SMTP_HOST, invite URLs are logged to the server console
SMTP_HOST=smtp.example.com
SMTP_PORT=587
# Use true or 1 for implicit TLS (e.g. port 465). Port 465 defaults to secure.
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=tDraw <noreply@example.com>

# Default invite link expiry in hours when the UI does not override (default 48; UI allows 1–168)
INVITE_TTL_HOURS=48

# --- Realtime ---
# Default: same origin as the web app (unified Next + Socket.io on PORT, e.g. 3000 in Docker).
# Set only when Socket.io runs on another origin (e.g. local dev with a separate process):
# REALTIME_PUBLIC_URL=http://localhost:3001
# NEXT_PUBLIC_REALTIME_URL=http://localhost:3001

# Standalone realtime process only (npm run realtime):
# REALTIME_PORT=3001

# Optional; requires a MongoDB replica set (not typical on a simple self-hosted single node):
# ENABLE_CHANGE_STREAMS=1
```

### Realtime: how it runs

| Mode | What to run | Notes |
|------|----------------|-------|
| **Production (Docker / VPS)** | `node server/prod.cjs` (image default) | One container: HTTP + Socket.io on the same port. No extra `NEXT_PUBLIC_REALTIME_URL` needed. |
| **Production (Vercel / serverless)** | `next start` only | No long-lived Socket.io on the platform; point the client at a separate realtime host with `REALTIME_PUBLIC_URL` / `NEXT_PUBLIC_REALTIME_URL`, or skip realtime. |
| **Local dev** | `npm run dev` | Next only on :3000. For Socket.io, run `npm run realtime` in another terminal and set `REALTIME_PUBLIC_URL=http://localhost:3001` (or use `NEXT_PUBLIC_REALTIME_URL`). |

Shared handlers live in [`src/lib/realtime/attachSocketIo.ts`](src/lib/realtime/attachSocketIo.ts). Optional standalone bundle: [`Dockerfile.realtime`](Dockerfile.realtime).

**Change Streams:** tDraw can subscribe to MongoDB **change streams** when `ENABLE_CHANGE_STREAMS=1`. That API **requires a replica set**. Most **self-hosted single-node** MongoDB installs are **not** replica sets, so **we do not rely on change streams** for core collaboration—Socket.io snapshots and saves cover typical use. Enable change streams only if you operate a proper replica set and want extra “sheet changed” fan-out.

### Local development

```bash
npm install
# Terminal 1 — Next.js
npm run dev
# Terminal 2 — optional: Socket.io on another port (set REALTIME_PUBLIC_URL in .env.local)
npm run realtime
```

### Docker Compose

The included [`docker-compose.yml`](docker-compose.yml) runs **web** (unified Next + Socket.io on **3000**) and **mongo** only. No second realtime container is required.

```bash
docker compose --env-file .env.local up -d --build
```

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth client (Web).
2. Authorized redirect URI: `https://your-domain/api/auth/callback/google` (and `http://localhost:3000/...` for dev).

---

## PWA (iPad & iPhone)

1. Open the site in **Safari**.
2. Share → **Add to Home Screen**.
3. Launch from the home screen for a fullscreen experience.

---

## Native apps (Capacitor 6)

Use this when you want an **.ipa** / **.apk** or Xcode-managed debugging while the Next.js app stays the source of truth.

| Step | Command / action |
|------|------------------|
| Install deps | `npm install` |
| Point the WebView at your deployment | Export `CAPACITOR_SERVER_URL=https://your-host` (or rely on `NEXTAUTH_URL` / `NEXT_PUBLIC_CAPACITOR_SERVER_URL` — see [`capacitor.config.ts`](capacitor.config.ts)) |
| Build the local TS plugin + copy web assets | `npm run cap:sync` (runs `plugin:pencil` then `cap sync`) |
| Open native IDE | `npm run cap:ios` or `npm run cap:android` |

Keep **NEXTAUTH_URL**, cookies, and **tunnel hosts** in sync with what the WebView loads (`allowedDevOrigins` / `serverActions.allowedOrigins` in `next.config.ts` for dev). The **PencilEnhanced** plugin lives under [`plugins/pencil-enhanced/`](plugins/pencil-enhanced/); native Swift is in `plugins/pencil-enhanced/ios/Plugin/`.

**Details:** [`docs/CAPACITOR_IOS.md`](docs/CAPACITOR_IOS.md) (iOS-focused name; includes Android parity notes).

---

## Extending the codebase

- **Authorization**: extend [`src/lib/authz/`](src/lib/authz/) and call `requireSheetPermission` / org helpers from every new server action or API route.
- **Realtime**: extend [`src/lib/realtime/attachSocketIo.ts`](src/lib/realtime/attachSocketIo.ts); keep room join behind the same access rules as the web app.
- **Email**: [`src/lib/email/sendInviteEmail.ts`](src/lib/email/sendInviteEmail.ts) uses **Nodemailer** and `SMTP_*` / `EMAIL_FROM` environment variables.

---

## License

tDraw is released under the [MIT License](docs/LICENSE).
