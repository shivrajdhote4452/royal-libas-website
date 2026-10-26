# Royal Libas by Tanya — Online Shop

Custom boutique e-commerce web application for **Royal Libas by Tanya**.

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL (Neon)
- **Status:** **Phase 0** — Scaffold + Sample Catalogue (Sample photos & mock data only)

---

## Phase 0 Notes & Notice

> ⚠️ **SAMPLE PHOTOS & SAMPLE PRICES ONLY:**
> All catalogue items and imagery currently shown are development mockups. Real product photography and pricing will be integrated in **Phase 6**. See [`SAMPLE_PHOTOS.md`](./SAMPLE_PHOTOS.md) for placeholder details.
> 
> Cart, checkout, Razorpay payments, and admin dashboard are scheduled for subsequent phases per the build plan.

---

## Prerequisites

- **Node.js**: v18+ (v20+ recommended)
- **npm**: v9+
- **Python**: 3.9+

---

## 1. Backend Setup & Run

The backend provides the REST API built with FastAPI.

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

4. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

5. Verify the backend health endpoint:
   - In browser or terminal: `http://localhost:8000/health`
   - Response:
     ```json
     {"status": "ok"}
     ```
   - Interactive Swagger API docs are available at `http://localhost:8000/docs`.

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