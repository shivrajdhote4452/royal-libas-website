from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Collection, Product, product_collections
from app.schemas import CollectionResponse

router = APIRouter(tags=["collections"])


@router.get("/collections", response_model=List[CollectionResponse])
def list_collections(db: Session = Depends(get_db)):
    """List collections with product counts of active products."""
    collections = db.query(Collection).all()
    results: List[CollectionResponse] = []

    for col in collections:
        # Count active products associated with this collection
        count = (
            db.query(func.count(Product.id))
            .join(product_collections, Product.id == product_collections.c.product_id)
            .filter(
                product_collections.c.collection_id == col.id,
                Product.is_active == True,
            )
            .scalar()
        ) or 0

        results.append(
            CollectionResponse(
                id=col.id,
                name=col.name,
                slug=col.slug,
                description=col.description,
                product_count=count,
            )
        )

    return results
