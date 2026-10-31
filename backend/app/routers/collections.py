from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Collection, Product, product_collections
from app.schemas import CollectionResponse

router = APIRouter(tags=["collections"])


@router.get("/collections", response_model=List[CollectionResponse])
def list_collections(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    include_archived: Optional[bool] = Query(None, description="Whether to include archived collections"),
    db: Session = Depends(get_db),
):
    """List collections with product counts of active products."""
    query = db.query(Collection)
    if is_active is not None:
        query = query.filter(Collection.is_active == is_active)
    elif include_archived is False:
        query = query.filter(Collection.is_active == True)

    collections = query.all()
    results: List[CollectionResponse] = []

    for col in collections:
        count = (
            db.query(func.count(Product.id))
            .join(product_collections, Product.id == product_collections.c.product_id)
            .filter(
                product_collections.c.collection_id == col.id,
                Product.is_active == True,
                Product.status == "PUBLISHED",
            )
            .scalar()
        ) or 0

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
