# tDraw: Premium iPad-First Note-Taking PWA

> The incredibly fast, absolutely beautiful, and fully self-hostable note-taking Progressive Web App designed purposefully for iPad and Apple Pencil. 

tDraw is a completely from-scratch, clean, minimalist, and premium notebook application. Your notes are accessible everywhere, incredibly performant, and entirely yours.

---

## 🎨 User Guide: How to Use tDraw

### Creating & Managing Notes
- **Dashboard**: When you log in, you will be taken to your Dashboard. Here you can see a grid of all your saved notes.
- **New Note**: Click the large "+ New Note" button to instantly spawn a fresh, infinite canvas.
- **Auto-Save**: You never have to click "Save". Everything you draw is automatically and instantly saved securely to the cloud.

### Drawing & Toolbar
When you enter a sheet, you have access to a suite of minimalist, powerful tools located at the bottom of the screen (or side, depending on your device):
- **Pencil/Pen Tool**: The default tool. It naturally responds to your mouse speed or your Apple Pencil's pressure and tilt for varying thicknesses.
- **Highlighter & Eraser**: Perfectly highlight text or erase precise pixels of your drawings.
- **Color Picker**: Change the color of your active tool to organize your thoughts cleanly.
- **Hand Tool (Pan)**: Use two fingers to drag around the screen, or select the Hand tool to drag your view across the infinite canvas.
- **Selection Tool**: Draw a box around your strokes to move or resize them dynamically.

### 📐 Perfect Shapes & Geometry
Currently, to draw perfect shapes (diagrams, flowcharts, exact borders), you should use the **Geometry Tools** built directly into the UI:
1. Tap the **Shapes** icon in your toolbar.
2. Select the **Rectangle**, **Ellipse (Circle)**, **Triangle**, or **Line** tool.
3. Drag across the screen to spawn a perfect geometric shape.

*(Note: "Smart Magic Recognition" where you draw a messy freehand circle and it automatically snaps into a perfect circle is an advanced upcoming feature currently being refined, and will be added as a toggle button in the toolbar soon!)*

### 📶 Offline Mode
tDraw heavily supports offline usage on your devices.
If you lose Wi-Fi on a flight:
1. Continue drawing normally inside your open sheet.
2. All your strokes are stored directly onto your iPad/Computer hardware memory via local algorithms.
3. The next time you open the app on a Wi-Fi connection, it will quietly sync all the beautiful strokes you made offline.

---

## 🚀 Self-Hosting Guide (Technical Deployments)

*(For developers and server admins)*

### 📋 Prerequisites
- **Node.js 20+**
- **Docker Compose**
- **MongoDB**
- **Google Cloud Platform (GCP)** (for OAuth Credentials)

### Step 1: Clone the Repository
```bash
git clone https://github.com/yourusername/tdraw.git
cd tdraw
```

### Step 2: Google OAuth Setup 
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a **New Project**.
3. Navigate to **APIs & Services > Credentials** -> **OAuth client ID** (Web application).
4. Set Authorized redirect URIs to: `http://localhost:3000/api/auth/callback/google`
5. Copy the Client ID and Secret to your `.env.local`.

### Step 3: Environment Variables
Create `.env.local` in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/tdraw
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_SECRET=your-random-strong-auth-secret-here
```

### Step 4: Running Locally (Docker)
1. Ensure `.env.local` has `MONGODB_URI=mongodb://mongo:27017/tdraw`
2. Run:
   ```bash
   docker-compose --env-file .env.local up -d --build
   ```
3. Visit `http://localhost:3000`.

---

## 📱 PWA Installation Guide (iPad & iPhone)
To get the true native feel on your iPad:
1. Open the **Safari browser**.
2. Navigate to your deployed tDraw website.
3. Tap the **Share** button (the square with an arrow pointing up) in the toolbar.
4. Scroll down and tap **"Add to Home Screen"**.
5. Launch the app directly from your Home Screen for a fullscreen native experience!

---

## 📄 License
tDraw is released as open-source software under the [MIT License](LICENSE).
