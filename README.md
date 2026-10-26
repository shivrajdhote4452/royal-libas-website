# Royal Libas by Tanya — Online Shop

Custom boutique e-commerce web application for **Royal Libas by Tanya**.

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL (Neon)
- **Status:** **Phase 4** — Cart, Guest Checkout, Razorpay Webhook & COD Orders Complete

---

## Phase 0 – 4 Notes

> ⚠️ **SAMPLE / DUMMY PHOTOS ONLY:**
> All storefront catalogue items and imagery currently shown on the frontend and APIs are development mockups (`DUMMY — ...`). Real product photography and pricing will be integrated in **Phase 6**. See [`SAMPLE_PHOTOS.md`](./SAMPLE_PHOTOS.md) for placeholder details.
> 
> Customer order tracking details page (`/track-order`) will be expanded with shipping logistics partner webhooks in **Phase 5**.

---

## Money, Stock & Payment Architecture

- **Money Convention:** All monetary amounts (`mrp`, `selling_price`, `subtotal`, `shipping_charge`, `discount`, `total`, `unit_price_snapshot`, `line_total`) are stored and calculated strictly in **Rupees with two decimal places (`Numeric(10, 2)`)** (e.g. `2999.00`).
- **Authoritative Server Calculations:** Totals, line amounts, and discounts are computed strictly from database prices on the backend. Frontend prices and totals are never trusted (verified via automated Tamper Tests).
- **Atomic Stock Decrements:** Stock decrement occurs in the exact same database transaction as order creation. If variant stock is insufficient or 0, the transaction rolls back cleanly with HTTP 400 (`"That size just sold out!"`).
- **Cryptographic Webhook Verification:** Online prepaid orders require verified HMAC SHA256 signatures (`X-Razorpay-Signature`) on `POST /payments/razorpay/webhook`. Idempotent processing guarantees duplicate webhooks do not re-modify or error.
- **Derived Badges:** Products dynamically derive `Sold Out` (when total stock = 0), `Low Stock` (total stock <= 5), `Bestseller`, and `New` (created within 14 days).

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
   python create_admin.py --email admin@royallibas.com --password YourSecurePassword
   ```

7. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

8. Verify the backend endpoints:
   - Health check: `http://localhost:8000/health` -> `{"status": "ok"}`
   - Catalogue Listing: `GET http://localhost:8000/products` (supports `?category=`, `?collection=`, `?size=`, `?sort=price_asc|price_desc|newest`)
   - Product Detail: `GET http://localhost:8000/products/{slug}`
   - Collections: `GET http://localhost:8000/collections`
   - Admin Login: `POST http://localhost:8000/admin/login` -> returns JWT access token
   - Admin Profile: `GET http://localhost:8000/admin/me` (requires Bearer token)
   - Admin Products: `POST /admin/products`, `PATCH /admin/products/{id}`, `POST /admin/products/{id}/variants`, `PATCH /admin/variants/{id}`
   - Cart Validation: `POST /cart/validate` (live database stock & prices)
   - Orders: `POST /orders` (authoritative server total calculation, atomic stock decrement), `GET /orders/{order_code}`
   - Payments: `POST /payments/razorpay/create-order`, `POST /payments/razorpay/webhook` (HMAC SHA256 verified)
   - Coupons: `POST /coupons/validate` (tested with `WELCOME10`, `FESTIVE100`)
   - Interactive Swagger API docs: `http://localhost:8000/docs`

9. Run Automated Test Suites:
   ```bash
   python tests/test_phase1.py   # Auth, JWT, DB constraints
   python tests/test_phase2.py   # Catalogue, badges, filters, admin APIs
   python tests/test_phase4.py   # Tamper tests, atomic stock, Razorpay HMAC webhook
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
   - Local: `http://localhost:5173/`
   - Network: accessible on local Wi-Fi / LAN for mobile browser testing.

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
│   │   ├── schemas.py    # Pydantic schemas
│   │   ├── services/     # Order authoritative math, payment webhook HMAC
│   │   └── routers/      # API routers (products, collections, cart, orders, payments, coupons, admin)
│   ├── tests/            # Automated test suites (test_phase1, test_phase2, test_phase4)
│   ├── seed.py           # Idempotent seed script
│   └── requirements.txt  # Python backend dependencies
└── frontend/
    ├── index.html        # Entry HTML with luxury typography
    ├── package.json      # Dependencies and scripts
    ├── tailwind.config.js# Custom brand color palette (maroon, gold, ivory)
    ├── vite.config.ts    # Vite bundler configuration
    └── src/
        ├── App.tsx       # Main routing layout
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
        │   ├── Checkout.tsx    # 1-page express guest checkout (COD & Razorpay)
        │   ├── OrderSuccess.tsx# Confirmed order details & timeline
        │   └── TrackOrder.tsx  # Track order lookup placeholder
        ├── types/
        │   ├── product.ts      # TypeScript interfaces for products & collections
        │   └── order.ts        # TypeScript interfaces for checkout & orders
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