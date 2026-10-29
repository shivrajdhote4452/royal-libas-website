from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import StoreSetting, ContactInquiry, NewsletterSubscriber
from app.schemas import (
    StoreSettingResponse,
    ContactInquiryCreate,
    ContactInquiryResponse,
    NewsletterSubscribeCreate,
    NewsletterSubscribeResponse,
)

router = APIRouter(tags=["store_info"])


@router.get("/settings", response_model=StoreSettingResponse)
def get_store_settings(db: Session = Depends(get_db)):
    """Retrieve public store settings (shipping threshold, fees, announcement bar, brand contacts)."""
    setting = db.query(StoreSetting).first()
    if not setting:
        setting = StoreSetting()
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return StoreSettingResponse(
        standard_cod_free_threshold=float(setting.standard_cod_free_threshold),
        free_shipping_threshold=float(setting.standard_cod_free_threshold),
        standard_shipping_fee=float(setting.standard_shipping_fee),
        express_shipping_fee=float(setting.express_shipping_fee),
        announcement_text=setting.announcement_text,
        whatsapp_number=setting.whatsapp_number,
        support_email=setting.support_email,
        instagram_handle=setting.instagram_handle,
        cod_enabled=bool(setting.cod_enabled),
        online_payment_enabled=bool(setting.online_payment_enabled),
    )


@router.post("/contact", response_model=ContactInquiryResponse, status_code=status.HTTP_201_CREATED)
def submit_contact_inquiry(payload: ContactInquiryCreate, db: Session = Depends(get_db)):
    """Accept and persist customer contact concierge / styling inquiry."""
    inquiry = ContactInquiry(
        name=payload.name,
        email=payload.email,
        message=payload.message,
    )
    db.add(inquiry)
    db.commit()
    return ContactInquiryResponse(
        status="success",
        message="Thank you for reaching out. Our concierge will connect with you shortly.",
    )


@router.post("/newsletter", response_model=NewsletterSubscribeResponse, status_code=status.HTTP_201_CREATED)
def subscribe_newsletter(payload: NewsletterSubscribeCreate, db: Session = Depends(get_db)):
    """Subscribe email to Royal Libas Atelier newsletter."""
    existing = (
        db.query(NewsletterSubscriber)
        .filter(NewsletterSubscriber.email == payload.email)
        .first()
    )
    if not existing:
        subscriber = NewsletterSubscriber(email=payload.email)
        db.add(subscriber)
        db.commit()

    return NewsletterSubscribeResponse(
        status="success",
        message="Thank you for subscribing to Royal Libas Atelier updates.",
    )
