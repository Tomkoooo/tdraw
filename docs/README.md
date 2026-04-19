# tDraw

> The premium iPad-first note-taking Progressive Web App.

tDraw is a completely from-scratch, clean, minimalist, and premium note-taking application designed purposefully for iPad and Apple Pencil. 
It combines the tactile fluid feeling of native iPad applications with the flexibility of a modern Progressive Web App (PWA), ensuring that your notes are accessible everywhere, yet performant and entirely yours.

## Features

- **Premium Interface:** A meticulously crafted user interface leveraging glassmorphism, responsive micro-animations, and fluid constraints meant to fade away so you can focus on drawing.
- **Offline-First PWA Mastery:** Full Service Worker and IndexedDB integration ensures that every stroke you make is saved instantly, even natively offline.
- **Apple Pencil Optimized:** True pressure sensitivity, sub-pixel rendering, and palm rejection out-of-the-box powered by the custom rendering engine wrapper over Tldraw.
- **Smart Shape Recognition:** Built-in tldraw shape engines refine geometry seamlessly.
- **End-to-End Ownership:** Row Level Security (RLS) managed manually at the Mongoose abstraction layer ensures that you—and only you—have access to your sheets.
- **Zero-Friction Authentication:** Instant Google OAuth sign-in without clunky passwords.
- **Infinite Canvas:** Seamless multi-touch pan and zoom gestures on an endless surface.
- **Docker Ready:** Deploy anywhere easily.

## How it Works

tDraw uses **Next.js 15 (App Router)** as the core framework.
- **Authentication:** `Auth.js (NextAuth v5)` handles Google OAuth seamlessly. Once authenticated, users receive an encrypted JWT session cookie.
- **Routing & Middleware:** Edge middleware intercepts requests. Protected routes (`/dashboard`, `/sheet`) validate the JWT token.
- **Database:** MongoDB stores user sessions and the entire `canvasState` documents. Row-Level Security is mimicked by ensuring `userId` corresponds to `session.user.id` on every query.
- **Canvas Rendering:** We use an underlying engine based on `tldraw` which has been styled with deep CSS hooks to feel exceptionally premium. The `TldrawEditor` component registers its own debounced `storeChanges` hook to auto-save to MongoDB via Server Actions.
- **PWA Strategy:** The `manifest.json` instructs iOS/Android to install it as a standalone app.

## Self-Hosting Guide

tDraw is built with portability in mind.

### Prerequisites

- Node.js 20+
- MongoDB instance (Atlas recommended)
- A Google Cloud Platform (GCP) project for OAuth Credentials
- Docker (if using containerized deployment)

### Environment Variables

Create a file named `.env.local` in the project root:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/tdraw
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_SECRET=your-random-strong-auth-secret
```

*Note: You can generate a strong `AUTH_SECRET` by running `npx auth secret`.*

### Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Navigate to **APIs & Services > Credentials**.
4. Create an **OAuth client ID** (Web application).
5. Set Authorized redirect URIs to: `http://localhost:3000/api/auth/callback/google` (or your production domain).
6. Copy the Client ID and Secret to your `.env.local`.

### Local Development

1. Clone the repository.
2. Run `npm install`.
3. Fill out the `.env.local`.
4. Run `npm run dev`.
5. Enter the sandbox at `http://localhost:3000`.

### Building and Running with Docker Compose

For a hassle-free robust deployment:

1. Populate your environment variables within `docker-compose.yml` or an `.env` file.
2. Run the compose environment:
   ```bash
   docker-compose up -d --build
   ```
3. The server natively listens on `3000`. You can proxy this traffic using NGINX or Traefik.

### PWA Installation Guide

Open your web browser (Safari recommended for iOS, Chrome for everything else) on your tablet or smartphone, navigate to your public hosted domain, and tap **"Add to Home Screen"**. The application will now operate completely fullscreen offline.

## License

tDraw is released as open-source software under the [MIT License](LICENSE).
