# Royal Libas by Tanya — Online Shop

Custom boutique e-commerce web application for **Royal Libas by Tanya**.

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL (Neon)
- **Status:** **Phase 8** — Soft Launch & Handover Complete (Full MVP Delivered)
- **Boutique Owner Guide:** See [HANDOVER_FOR_TANYA.md](file:///f:/Project%20File/royal-libas-website/royal-libas-website/HANDOVER_FOR_TANYA.md) for Tanya's daily 15-minute phone routine, COD WhatsApp confirmations, and stock management.

---

## Sample Catalogue & Live Content Notice

> **SAMPLE ONLY — all 16 products are placeholders made by tinting/cropping 3 base images, to be replaced with Tanya's real photos, prices and stock before launch.**

- **Sample Photography:** 100% of catalogue items feature sample photography with a visible "SAMPLE PHOTO" badge across all product cards and product pages until Tanya supplies real photos.
- **Boutique Policy Pages:** All 5 customer care and legal policy pages are live and mobile-optimized:
  1. **About Page** (`/about`): Tanya's founding story, tailoring philosophy, and boutique craftsmanship.
  2. **Shipping & Delivery Policy** (`/shipping-policy`): 24–48 hour dispatch, 3–5 day delivery, free prepaid shipping, flat ₹99 COD charge.
  3. **Exchange & Returns Policy** (`/return-policy`): 7-day doorstep size exchange guarantee with WhatsApp concierge.
  4. **Contact Page** (`/contact`): Contact details: To be confirmed by Tanya.
  5. **Privacy Policy & Terms** (`/privacy-policy`, `/terms-of-service`): Customer data protection and secure payment processing.

---

## Money, Stock & Payment Architecture

- **Money Convention:** All monetary amounts (`mrp`, `selling_price`, `subtotal`, `shipping_charge`, `discount`, `total`, `unit_price_snapshot`, `line_total`) are stored and calculated strictly in **Rupees with two decimal places (`Numeric(10, 2)`)** (e.g. `2999.00`).
- **Authoritative Server Calculations:** Totals, line amounts, and discounts are computed strictly from database prices on the backend. Frontend prices and totals are never trusted (verified via automated Tamper Tests).
- **Atomic Stock Decrements:** Stock decrement occurs in the exact same database transaction as order creation. If variant stock is insufficient or 0, the transaction rolls back cleanly with HTTP 400 (`"That size just sold out!"`).
- **Cryptographic Webhook Verification:** Online prepaid orders require verified HMAC SHA256 signatures (`x-webhook-signature`, `x-webhook-timestamp`) on `POST /payments/cashfree/webhook`. Idempotent processing guarantees duplicate webhooks do not re-modify or error.
- **Privacy-First Customer Tracking:** `GET /orders/track?order_code=...&phone=...` strictly requires BOTH the order reference and the matching 10-digit mobile number used at checkout. Mismatched phone numbers or missing parameters return HTTP 404/400 without leaking order data.
- **Phone-Friendly Admin Panel:** Tanya can run daily boutique operations from her phone (`/admin`) without developer intervention: view today's orders & to-pack queue, fulfill shipments with courier tracking links, add new products, adjust stock with single-tap `+` / `-` controls, and contact clients via one-click WhatsApp.

---

## Prerequisites

- **Node.js**: v18+ (v20+ recommended)
- **npm**: v9+
- **Python**: 3.9+

---

## 1. Backend Setup & Run

The backend provides the REST API built with FastAPI, SQLAlchemy, and Alembic.

### Steps:

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. (Optional but recommended) Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run Database Migrations (Alembic):
   ```bash
   alembic upgrade head
   ```

5. Seed Initial Catalogue Data & Coupons (Idempotent):
   ```bash
   python seed.py
   ```

6. Create Initial Admin User:
   ```bash
   # Interactive prompt:
   python create_admin.py

   # Or with arguments:
   python create_admin.py --email owner@royallibas.com --password YourSecurePassword
   ```

7. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

8. Key REST Endpoints:
   - **Health check:** `GET http://localhost:8000/health` -> `{"status": "ok"}`
   - **Catalogue Listing:** `GET /products` (supports `?category=`, `?collection=`, `?size=`, `?sort=price_asc|price_desc|newest`)
   - **Product Detail:** `GET /products/{slug}`
   - **Collections:** `GET /collections`
   - **Cart Validation:** `POST /cart/validate` (checks live database stock & prices)
   - **Orders:** `POST /orders` (authoritative server total calculation, atomic stock decrement), `GET /orders/{order_code}`
   - **Public Tracking:** `GET /orders/track?order_code=...&phone=...` (requires both order code and matching phone)
   - **Payments:** `POST /payments/cashfree/create-order`, `POST /payments/cashfree/webhook` (HMAC SHA256 verified)
   - **Coupons:** `POST /coupons/validate` (tested with `WELCOME10`, `FESTIVE100`)
   - **Admin Auth:** `POST /admin/login`, `GET /admin/me`
   - **Admin Dashboard:** `GET /admin/dashboard` (today's orders, to-pack queue, live low-stock alerts)
   - **Admin Orders & Fulfillment:** `GET /admin/orders`, `GET /admin/orders/{id}`, `PATCH /admin/orders/{id}/status`
   - **Admin Products & Stock:** `GET /admin/products`, `POST /admin/products`, `PATCH /admin/products/{id}`, `POST /admin/products/{id}/variants`, `PATCH /admin/variants/{id}`
   - **Admin Clientele Roster:** `GET /admin/customers`
   - **Interactive Swagger Docs:** `http://localhost:8000/docs`

9. Run Automated Test Suites:
   ```bash
   python tests/test_phase1.py   # Auth, JWT, DB constraints
   python tests/test_phase2.py   # Catalogue, badges, filters, admin APIs
   python tests/test_phase4.py   # Tamper tests, atomic stock, Cashfree HMAC webhook
   python tests/test_phase5.py   # Order tracking privacy, admin auth guards, dashboard, and fulfillment
   ```

---

## 2. Frontend Setup & Run

The frontend is a Vite + React 18 + TypeScript + Tailwind application.

### Steps:

1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```

4. Open your browser:
   - Storefront: `http://localhost:5173/`
   - Order Tracking: `http://localhost:5173/track-order`
   - Admin Login: `http://localhost:5173/admin/login`
   - Admin Panel: `http://localhost:5173/admin/dashboard` (mobile optimized)

---

## Project Structure

```text
royal-libas-website/
├── .env.example          # Environment variable placeholders (no real secrets)
├── .gitignore            # Git ignore rules (*.pdf, .env, node_modules, etc.)
├── README.md             # Project documentation and run steps
├── SAMPLE_PHOTOS.md      # Registry of sample images and replacement warnings
├── backend/
│   ├── alembic/          # Database migrations structure
│   ├── alembic.ini       # Alembic configuration
│   ├── app/
│   │   ├── main.py       # FastAPI application & router registrations
│   │   ├── config.py     # Application configuration & env vars
│   │   ├── models.py     # SQLAlchemy models (products, variants, orders, coupons, addresses)
│   │   ├── schemas.py    # Pydantic schemas (catalog, order, payment, tracking, admin)
│   │   ├── services/     # Order authoritative math, payment webhook HMAC
│   │   └── routers/      # API routers (products, collections, cart, orders, payments, coupons, admin)
│   ├── tests/            # Automated test suites (test_phase1, test_phase2, test_phase4, test_phase5)
│   ├── seed.py           # Idempotent seed script
│   └── requirements.txt  # Python backend dependencies
└── frontend/
    ├── index.html        # Entry HTML with luxury typography
    ├── package.json      # Dependencies and scripts
    ├── tailwind.config.js# Custom brand color palette (maroon, gold, ivory)
    ├── vite.config.ts    # Vite bundler configuration
    └── src/
        ├── App.tsx       # Main routing layout (storefront + protected admin routes)
        ├── main.tsx      # React 18 mount point
        ├── index.css     # Tailwind styling directives
        ├── components/
        │   ├── Header.tsx      # Boutique brand header and navigation
        │   ├── Footer.tsx      # Boutique footer with policies & contact
        │   └── ProductCard.tsx # Card with dynamic badges & fallback
        ├── context/
        │   └── CartContext.tsx # Persistent cart state provider with quantity controls
        ├── pages/
        │   ├── Home.tsx        # Home page with 8 exact brand blocks
        │   ├── Shop.tsx        # API-driven shop catalogue with filter sidebar & sort
        │   ├── Product.tsx     # Product detail page with stock-aware size selector
        │   ├── Cart.tsx        # Shopping bag with live stock validation
        │   ├── Checkout.tsx    # 1-page express guest checkout (COD & Cashfree)
        │   ├── OrderSuccess.tsx# Confirmed order details & timeline
        │   ├── TrackOrder.tsx  # Customer live order tracking with status stepper & courier link
        │   └── admin/          # Phone-friendly admin panel
        │       ├── AdminLogin.tsx      # JWT admin sign-in
        │       ├── AdminLayout.tsx     # Shell with mobile bottom tab navigation
        │       ├── AdminDashboard.tsx  # Today's orders, to-pack queue, low-stock alerts
        │       ├── AdminOrders.tsx     # Order fulfillment, courier assignment & WhatsApp
        │       ├── AdminProducts.tsx   # Add products, add sizes, instant stock +/- editor
        │       └── AdminCustomers.tsx  # Read-only clientele roster with WhatsApp link
        ├── types/
        │   ├── product.ts      # TypeScript interfaces for products & collections
        │   └── order.ts        # TypeScript interfaces for checkout, tracking & admin
        └── lib/
            └── api.ts          # API client for backend communication
```

---

## Environment Variables
 
Copy `.env.example` to `.env` when configuring database and services:
```bash
cp .env.example .env
```
*Note: Never commit real secrets or production credentials to source control.*

---

## Operations & Launch Hardening Runbook (Phase 7)

### 1. Database Backups & Point-in-Time Restore (PITR)
- **Neon PostgreSQL (Production):**
  - Neon automatically takes continuous WAL (Write-Ahead Log) snapshots providing 7-day Point-in-Time Recovery (PITR).
  - To restore or branch from any timestamp:
    1. Log in to the Neon Console -> select the `royal-libas` project.
    2. Go to **Branches** -> **Create Branch from Point in Time**.
    3. Select the timestamp prior to the incident, test the branch connection string, and swap `DATABASE_URL` in hosting settings.
- **SQLite (Local Development Snapshot):**
  - To create an immediate local SQL dump:
    ```bash
    sqlite3 royal_libas.db .dump > backup_local_$(date +%Y%m%d_%H%M%S).sql
    ```
  - To restore from a snapshot:
    ```bash
    sqlite3 royal_libas_restored.db < backup_local_TIMESTAMP.sql
    ```

### 2. Backend Hosting Tier & Cold-Start Behavior
- **Free-Tier Sleep Characteristics:**
  - Free tiers on cloud providers (e.g., Render Web Services, Koyeb) automatically spin down web containers after 15 minutes of inactivity.
  - The first request after sleep experiences a **~45–55 second cold-start latency** while the container boots and connects to the database pool.
  - The frontend includes loading spinners and graceful timeouts, but cold starts on direct Instagram ad referrals can degrade first-touch conversion.
- **Production Launch Recommendation (Accepted Decision):**
  - For public launch on 5 November, run the backend on a persistent non-sleeping tier (e.g., **Render Starter @ $7/mo** or **Railway Hobby @ $5/mo**).
  - This ensures sub-100ms API response times 24/7 and eliminates payment session timeouts.

### 3. Security & Anti-Abuse Measures
- **Strict Address & Pincode Validation:** Both frontend and backend enforce exact 6-digit Indian delivery pincodes and required street details, preventing invalid courier dispatch.
- **Brute-Force Rate Limiting:** The admin login route (`POST /admin/login`) enforces an in-memory sliding window: after 5 consecutive failed attempts, the account is temporarily locked for 5 minutes (`HTTP 429 Too Many Requests` with `Retry-After: 300`).
- **Atomic Order Cancellation Restock:** Cancelling an order via the admin panel immediately and atomically returns variant stock to the database within the same transaction.
- **Zero Real Secrets In Code:** Automated regex scans verify zero production credentials, API secrets, or unhashed passwords exist in git history or tracked files.
- **Restricted CORS Policy:** Allowed origins are strictly scoped to the configured `FRONTEND_URL` and authorized development servers (no open `*` wildcard).