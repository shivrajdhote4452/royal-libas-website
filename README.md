# Royal Libas by Tanya — Online Shop

Custom boutique e-commerce web application for **Royal Libas by Tanya**.

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL (Neon)
- **Status:** **Phase 1** — Database, Backend Core & Admin Login Complete

---

## Phase 0 & Phase 1 Notes

> ⚠️ **SAMPLE PHOTOS & SAMPLE PRICES ONLY:**
> All storefront catalogue items and imagery currently shown on the frontend are development mockups. Real product photography and pricing will be integrated in **Phase 6**. See [`SAMPLE_PHOTOS.md`](./SAMPLE_PHOTOS.md) for placeholder details.
> 
> Cart, checkout, Razorpay payments, and customer tracking are scheduled for subsequent phases per the build plan.

---

## Money & Stock Conventions (Reference A)

- **Money Convention:** All monetary amounts (`mrp`, `selling_price`, `subtotal`, `shipping_charge`, `discount`, `total`, `unit_price_snapshot`, `line_total`) are stored and calculated strictly in **Rupees with two decimal places (`Numeric(10, 2)`)** (e.g. `2999.00`).
- **Stock & Variant Rule:** Stock and selling prices live strictly on `product_variants`, never on `products`. Stock has a database constraint `stock >= 0`.
- **Order Price Snapshots:** Order line items snapshot unit prices and product details at purchase time.

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

5. Create Initial Admin User:
   ```bash
   # Interactive prompt:
   python create_admin.py

   # Or with arguments:
   python create_admin.py --email admin@royallibas.com --password YourSecurePassword
   ```

6. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

7. Verify the backend endpoints:
   - Health check: `http://localhost:8000/health` -> `{"status": "ok"}`
   - Admin Login: `POST http://localhost:8000/admin/login` -> returns JWT access token
   - Admin Profile: `GET http://localhost:8000/admin/me` (requires Bearer token)
   - Interactive Swagger API docs: `http://localhost:8000/docs`

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
│   │   ├── main.py       # FastAPI application & GET /health endpoint
│   │   ├── models.py     # SQLAlchemy models placeholder
│   │   ├── schemas.py    # Pydantic schemas placeholder
│   │   └── routers/      # API routers package placeholder
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
        │   └── ProductCard.tsx # Card with SAMPLE PHOTO badge & image fallback
        ├── context/
        │   └── CartContext.tsx # Empty cart state provider for Phase 0
        ├── data/
        │   └── sampleProducts.ts # 5 sample products with seeded placeholder URLs
        ├── pages/
        │   ├── Home.tsx    # Home page with hero & 5 sample products grid
        │   ├── Shop.tsx    # Sample shop catalogue placeholder
        │   └── Product.tsx # Product detail page with 3 sample images gallery
        └── types/
            └── product.ts  # TypeScript interfaces for products & stock
```

---

## Environment Variables

Copy `.env.example` to `.env` when configuring database and services:
```bash
cp .env.example .env
```
*Note: Never commit real secrets or production credentials to source control.*