# L'AURA — Artisanal Modern Brasserie & Farm-to-Table Kitchen

An artisanal modern brasserie and culinary experience website featuring seasonal tasting menus, real-time live restaurant hours, online table reservation management, cellar newsletter subscription, and private event inquiries.

---

## 🚀 Deploying to Vercel

This repository is pre-configured for 1-click deployment on **Vercel** with zero extra configuration.

### Option 1: Deploy with Vercel Web Dashboard (Recommended)

1. Push your latest code to your GitHub repository:
   ```bash
   git add .
   git commit -m "Configure for Vercel deployment"
   git push origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new) and log in.
3. Import your GitHub repository (`test12`).
4. Keep the default settings:
   - **Framework Preset**: `Other` (detected automatically)
   - **Root Directory**: `./`
5. Click **Deploy**.

---

### Option 2: Deploy using Vercel CLI

1. Install the Vercel CLI:
   ```bash
   npm i -g vercel
   ```
2. Deploy to preview:
   ```bash
   vercel
   ```
3. Deploy directly to production:
   ```bash
   vercel --prod
   ```

---

## 🛠️ Architecture on Vercel

- **Edge Static CDN**: All pages (`/`, `/menu`, `/about`, `/reservations`, `/contact`) and static assets (`/css/*`, `/js/*`, `/images/*`) are served directly from Vercel's global CDN for sub-millisecond response times.
- **Clean URLs**: Configured via `vercel.json` (`cleanUrls: true`) so URLs like `/menu` serve `menu.html` without showing `.html` in the browser.
- **Serverless API**: Handled seamlessly by `api/index.js` routing to the Express engine.
  - `GET /api` — Health status & endpoint list
  - `GET /api/status` — Live open/closed restaurant status
  - `GET /api/menu` & `GET /api/menu/:id` — Tasting and seasonal menu items
  - `GET /api/reservations` & `POST /api/reservations` & `DELETE /api/reservations/:id` — Table booking management
  - `POST /api/contact` — Concierge & private event inquiries
  - `POST /api/newsletter` — Cellar Notes newsletter signup
- **Resilient File Handling**: Built-in fallback to `/tmp` and in-memory caches to prevent serverless read-only filesystem errors (`EROFS`).
- **Custom 404 Page**: `public/404.html` branded with L'AURA styling for unmatched URLs.

---

## 💻 Local Development

Run the local Node.js development server:

```bash
npm install
npm run dev
# or
npm start
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.
