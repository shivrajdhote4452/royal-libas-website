"""Production SEO & Sitemap Router for Royal Libas by Tanya.

Serves:
1. /sitemap.xml & /api/sitemap.xml
   - Valid XML sitemap adhering strictly to the sitemaps.org 0.9 protocol.
   - Includes Google Image Sitemap extensions (<image:image>) for rich image indexing.
   - Dynamic: reflects live PostgreSQL published active products in real time.
   - Canonical domain defaults to https://royallibasbytanya.com.
   - Strictly excludes admin, cart, checkout, draft, inactive, and archived products.
   - Graceful fallback: returns valid static-page XML sitemap on empty catalogue or database connection issues.

2. /robots.txt & /api/robots.txt
   - Standard search bot crawler instructions.
   - Grants access to public storefront and catalog.
   - Explicitly disallows admin, cart, checkout, and customer order tokens.
   - Canonical Sitemap directive.
"""

import logging
from pathlib import Path
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Tuple, Optional
from fastapi import APIRouter, Depends, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session, joinedload

from app.config import CANONICAL_BASE_URL
from app.database import get_db
from app.models import Product

logger = logging.getLogger(__name__)

router = APIRouter(tags=["seo"])

SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1"

# Static public storefront pages with change frequency and crawl priority
STATIC_PUBLIC_PAGES: List[Tuple[str, str, str]] = [
    ("/", "daily", "1.0"),
    ("/shop", "daily", "0.9"),
    ("/about", "monthly", "0.7"),
    ("/contact", "monthly", "0.7"),
    ("/shipping-policy", "monthly", "0.5"),
    ("/return-policy", "monthly", "0.5"),
    ("/exchange-policy", "monthly", "0.5"),
    ("/privacy-policy", "monthly", "0.3"),
    ("/terms-of-service", "monthly", "0.3"),
]


def build_sitemap_xml(base_url: str, products: Optional[List[Product]] = None) -> str:
    """Build a syntactically valid XML sitemap string using ElementTree.
    
    Guarantees well-formed XML, proper entity escaping, and namespace attribution.
    """
    ET.register_namespace("", SITEMAP_NS)
    ET.register_namespace("image", IMAGE_NS)

    urlset = ET.Element(f"{{{SITEMAP_NS}}}urlset")

    # 1. Canonical Static Pages
    for path, changefreq, priority in STATIC_PUBLIC_PAGES:
        url_elem = ET.SubElement(urlset, f"{{{SITEMAP_NS}}}url")
        loc_elem = ET.SubElement(url_elem, f"{{{SITEMAP_NS}}}loc")
        loc_elem.text = f"{base_url}{path}" if path == "/" else f"{base_url}{path}"

        cf_elem = ET.SubElement(url_elem, f"{{{SITEMAP_NS}}}changefreq")
        cf_elem.text = changefreq

        prio_elem = ET.SubElement(url_elem, f"{{{SITEMAP_NS}}}priority")
        prio_elem.text = priority

    # 2. Published & Active Products
    if products:
        for product in products:
            # Enforce visibility rules: must have slug, be active, and have PUBLISHED status
            if not product.slug or not product.is_active or product.status != "PUBLISHED":
                continue

            clean_slug = product.slug.strip()
            encoded_slug = urllib.parse.quote(clean_slug, safe="/-")
            product_url = f"{base_url}/product/{encoded_slug}"

            url_elem = ET.SubElement(urlset, f"{{{SITEMAP_NS}}}url")
            loc_elem = ET.SubElement(url_elem, f"{{{SITEMAP_NS}}}loc")
            loc_elem.text = product_url

            # ISO Last Modified Date (YYYY-MM-DD)
            lastmod_dt = getattr(product, "updated_at", None) or getattr(product, "created_at", None)
            if lastmod_dt and isinstance(lastmod_dt, datetime):
                lm_elem = ET.SubElement(url_elem, f"{{{SITEMAP_NS}}}lastmod")
                lm_elem.text = lastmod_dt.strftime("%Y-%m-%d")

            cf_elem = ET.SubElement(url_elem, f"{{{SITEMAP_NS}}}changefreq")
            cf_elem.text = "weekly"

            prio_elem = ET.SubElement(url_elem, f"{{{SITEMAP_NS}}}priority")
            prio_elem.text = "0.8"

            # Primary Image Attachment for Google Image Search
            images = getattr(product, "images", None) or []
            if images:
                primary_img = None
                for img in images:
                    if getattr(img, "url", None) and getattr(img, "resource_type", "image") == "image":
                        primary_img = img
                        break
                if not primary_img and images and getattr(images[0], "url", None):
                    primary_img = images[0]

                if primary_img and primary_img.url:
                    img_elem = ET.SubElement(url_elem, f"{{{IMAGE_NS}}}image")
                    img_loc = ET.SubElement(img_elem, f"{{{IMAGE_NS}}}loc")
                    img_loc.text = primary_img.url.strip()
                    if product.name:
                        img_title = ET.SubElement(img_elem, f"{{{IMAGE_NS}}}title")
                        img_title.text = product.name.strip()

    ET.indent(urlset, space="  ")
    return ET.tostring(urlset, encoding="utf-8", xml_declaration=True).decode("utf-8")


@router.api_route("/sitemap.xml", methods=["GET", "HEAD"])
@router.api_route("/api/sitemap.xml", methods=["GET", "HEAD"])
def get_sitemap(db: Session = Depends(get_db)):
    """Return production-ready XML sitemap dynamically reflecting live published products."""
    base_url = CANONICAL_BASE_URL.rstrip("/")

    products: List[Product] = []
    try:
        products = (
            db.query(Product)
            .options(joinedload(Product.images))
            .filter(
                Product.is_active == True,
                Product.status == "PUBLISHED",
            )
            .order_by(Product.updated_at.desc(), Product.id.desc())
            .all()
        )
    except Exception as exc:
        logger.error("Failed to fetch products for dynamic sitemap: %s", exc, exc_info=True)
        products = []

    xml_content = build_sitemap_xml(base_url, products)

    return Response(
        content=xml_content,
        media_type="application/xml; charset=utf-8",
        headers={
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.api_route("/robots.txt", methods=["GET", "HEAD"], response_class=PlainTextResponse)
@router.api_route("/api/robots.txt", methods=["GET", "HEAD"], response_class=PlainTextResponse)
def get_robots():
    """Return crawler indexing directives and canonical sitemap URL."""
    base_url = CANONICAL_BASE_URL.rstrip("/")
    content = (
        "User-agent: *\n"
        "Allow: /\n\n"
        "# Disallow administrative and checkout areas\n"
        "Disallow: /admin/\n"
        "Disallow: /cart\n"
        "Disallow: /checkout\n"
        "Disallow: /order-success/\n\n"
        f"Sitemap: {base_url}/sitemap.xml\n"
    )
    return PlainTextResponse(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
        },
    )


FAVICON_STATIC_PATH = Path(__file__).resolve().parent.parent / "static" / "favicon.ico"
FAVICON_PUBLIC_PATH = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "public" / "favicon.ico"


@router.api_route("/favicon.ico", methods=["GET", "HEAD"])
@router.api_route("/api/favicon.ico", methods=["GET", "HEAD"])
def get_favicon_ico():
    """Serve binary favicon.ico with appropriate caching and MIME type."""
    target_path = None
    if FAVICON_STATIC_PATH.is_file():
        target_path = FAVICON_STATIC_PATH
    elif FAVICON_PUBLIC_PATH.is_file():
        target_path = FAVICON_PUBLIC_PATH

    if target_path:
        with open(target_path, "rb") as f:
            data = f.read()
        return Response(
            content=data,
            media_type="image/x-icon",
            headers={
                "Content-Type": "image/x-icon",
                "Cache-Control": "public, max-age=86400",
                "X-Content-Type-Options": "nosniff",
            },
        )
    return Response(status_code=404)
