from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth import get_current_admin_optional
from app.database import get_db
from app.models import Admin, Collection, Product, product_collections
from app.schemas import CollectionResponse

router = APIRouter(tags=["collections"])


@router.get("/collections", response_model=List[CollectionResponse])
def list_collections(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    include_archived: Optional[bool] = Query(None, description="Whether to include archived collections"),
    include_drafts: bool = Query(False, description="Include DRAFT products in count (admin only)"),
    db: Session = Depends(get_db),
    admin: Optional[Admin] = Depends(get_current_admin_optional),
):
    """List collections with product counts.
    Public requests default to active collections and published products.
    Authenticated admins can view archived collections and draft counts.
    """
    is_admin = admin is not None and admin.is_active

    query = db.query(Collection)
    if is_active is not None:
        query = query.filter(Collection.is_active == is_active)
    elif include_archived is False:
        query = query.filter(Collection.is_active == True)
    elif include_archived is None and not is_admin:
        # Default public listing to active canonical collections only
        query = query.filter(Collection.is_active == True)

    collections = query.all()
    results: List[CollectionResponse] = []

    for col in collections:
        count_q = (
            db.query(func.count(Product.id))
            .join(product_collections, Product.id == product_collections.c.product_id)
            .filter(product_collections.c.collection_id == col.id)
        )

        if is_admin and include_drafts:
            count_q = count_q.filter(Product.status != "ARCHIVED")
        else:
            count_q = count_q.filter(
                Product.is_active == True,
                Product.status == "PUBLISHED",
            )

        count = count_q.scalar() or 0

        results.append(
            CollectionResponse(
                id=col.id,
                name=col.name,
                slug=col.slug,
                description=col.description,
                is_active=getattr(col, "is_active", True),
                product_count=count,
            )
        )

    return results
