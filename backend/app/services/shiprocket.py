import time
from typing import Any, Dict, List, Optional, Union
import httpx
from fastapi import HTTPException, status

from app.config import (
    SHIPROCKET_API_EMAIL,
    SHIPROCKET_API_PASSWORD,
    is_shiprocket_configured,
)

BASE_URL = "https://apiv2.shiprocket.in/v1/external"

# In-memory auth token cache
# Shiprocket tokens are valid for 240 hours (10 days).
# We cache for up to 9 days to stay safely within validity.
_cached_token: Optional[str] = None
_token_timestamp: float = 0.0
TOKEN_MAX_AGE_SECONDS = 9 * 86400  # 9 days in seconds


def clear_token_cache() -> None:
    """Clear cached authentication token (used on 401 retries and in testing)."""
    global _cached_token, _token_timestamp
    _cached_token = None
    _token_timestamp = 0.0


def get_auth_token(force_refresh: bool = False) -> str:
    """Obtain or return cached Shiprocket bearer token.
    
    If token is not cached or force_refresh is True, logs in via POST /auth/login.
    Never logs in fresh on every call.
    """
    global _cached_token, _token_timestamp

    if not is_shiprocket_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Shiprocket not configured — use manual tracking",
        )

    now = time.time()
    if not force_refresh and _cached_token and (now - _token_timestamp < TOKEN_MAX_AGE_SECONDS):
        return _cached_token

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                f"{BASE_URL}/auth/login",
                json={
                    "email": SHIPROCKET_API_EMAIL,
                    "password": SHIPROCKET_API_PASSWORD,
                },
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Network error connecting to Shiprocket: {str(exc)}",
        )

    if resp.status_code != 200:
        err_msg = resp.text
        try:
            body = resp.json()
            err_msg = body.get("message") or body.get("error") or err_msg
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Shiprocket authentication failed: {err_msg}",
        )

    data = resp.json()
    token = data.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Shiprocket authentication succeeded but no token was returned.",
        )

    _cached_token = token
    _token_timestamp = now
    return _cached_token


def _shiprocket_request(
    method: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    json_data: Optional[Dict[str, Any]] = None,
    retry_on_401: bool = True,
) -> Dict[str, Any]:
    """Execute authenticated HTTP request to Shiprocket API with automatic 401 retry."""
    token = get_auth_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = f"{BASE_URL}{path}"

    try:
        with httpx.Client(timeout=25.0) as client:
            resp = client.request(
                method=method.upper(),
                url=url,
                headers=headers,
                params=params,
                json=json_data,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Network error communicating with Shiprocket ({path}): {str(exc)}",
        )

    # On 401 Unauthorized, re-login once and retry that call once
    if resp.status_code == 401 and retry_on_401:
        clear_token_cache()
        new_token = get_auth_token(force_refresh=True)
        headers["Authorization"] = f"Bearer {new_token}"
        try:
            with httpx.Client(timeout=25.0) as client:
                resp = client.request(
                    method=method.upper(),
                    url=url,
                    headers=headers,
                    params=params,
                    json=json_data,
                )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Network error on retry with Shiprocket ({path}): {str(exc)}",
            )

    try:
        data = resp.json()
    except Exception:
        data = {"raw_text": resp.text}

    if resp.status_code >= 400:
        err_msg = None
        if isinstance(data, dict):
            err_msg = (
                data.get("message")
                or data.get("error")
                or (data.get("errors") and str(data.get("errors")))
                or data.get("raw_text")
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST if resp.status_code < 500 else status.HTTP_502_BAD_GATEWAY,
            detail=f"Shiprocket API error: {err_msg or resp.text}",
        )

    return data


# ==========================================
# Exactly the 8 required Shiprocket API steps
# ==========================================

def check_serviceability(
    pickup_pincode: str,
    delivery_pincode: str,
    weight_kg: float,
    cod: bool,
) -> Dict[str, Any]:
    """Check courier serviceability and rates for parcel."""
    params = {
        "pickup_postcode": str(pickup_pincode).strip(),
        "delivery_postcode": str(delivery_pincode).strip(),
        "weight": str(weight_kg),
        "cod": 1 if cod else 0,
    }
    res = _shiprocket_request("GET", "/courier/serviceability/", params=params)

    # Shiprocket typically nests available couriers under data.available_courier_companies
    data_block = res.get("data") if isinstance(res.get("data"), dict) else res
    available = data_block.get("available_courier_companies") or []
    recommended_id = data_block.get("recommended_courier_company_id") or data_block.get("recommended_courier_id")

    return {
        "available_courier_companies": available,
        "recommended_courier_company_id": recommended_id,
        "raw": res,
    }


def create_order(order_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create order in Shiprocket (POST /orders/create/adhoc).
    
    Returns shiprocket_order_id and shipment_id.
    """
    res = _shiprocket_request("POST", "/orders/create/adhoc", json_data=order_payload)

    # Shiprocket can return IDs directly or in data block
    order_id = res.get("order_id") or (res.get("data") and res["data"].get("order_id"))
    shipment_id = res.get("shipment_id") or (res.get("data") and res["data"].get("shipment_id"))

    if not order_id or not shipment_id:
        err_msg = res.get("message") or (res.get("data") and str(res["data"])) or str(res)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shiprocket order creation failed: {err_msg}",
        )

    return {
        "shiprocket_order_id": str(order_id),
        "shipment_id": str(shipment_id),
        "raw": res,
    }


def assign_awb(
    shipment_id: str,
    courier_id: Optional[Union[int, str]] = None,
) -> Dict[str, Any]:
    """Assign AWB to shipment (POST /courier/assign/awb).
    
    Returns awb_code and courier_name.
    """
    payload: Dict[str, Any] = {"shipment_id": str(shipment_id)}
    if courier_id:
        payload["courier_id"] = int(courier_id)

    res = _shiprocket_request("POST", "/courier/assign/awb", json_data=payload)

    # Response structure in Shiprocket:
    # {"response": {"data": {"awb_code": "...", "courier_name": "..."}, "awb_assign_status": 1}}
    resp_block = res.get("response", {})
    if isinstance(resp_block, dict):
        data_block = resp_block.get("data", {})
    else:
        data_block = {}

    awb_code = (
        data_block.get("awb_code")
        or res.get("awb_code")
        or (res.get("data") and res["data"].get("awb_code"))
    )
    courier_name = (
        data_block.get("courier_name")
        or res.get("courier_name")
        or (res.get("data") and res["data"].get("courier_name"))
    )

    if not awb_code:
        err = data_block.get("error") or resp_block.get("message") or res.get("message") or "Failed to assign AWB"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shiprocket AWB assignment failed: {err}",
        )

    return {
        "awb_code": str(awb_code),
        "courier_name": str(courier_name or "Shiprocket Partner"),
        "raw": res,
    }


def generate_pickup(shipment_id: str) -> Dict[str, Any]:
    """Schedule courier pickup (POST /courier/generate/pickup)."""
    # Shiprocket takes list of shipment IDs
    payload = {"shipment_id": [int(shipment_id) if str(shipment_id).isdigit() else shipment_id]}
    res = _shiprocket_request("POST", "/courier/generate/pickup", json_data=payload)

    resp_block = res.get("response", {}) if isinstance(res.get("response"), dict) else {}
    pickup_status = (
        resp_block.get("pickup_status")
        or res.get("pickup_status")
        or res.get("message")
        or "SCHEDULED"
    )

    return {
        "pickup_status": str(pickup_status),
        "raw": res,
    }


def generate_label(shipment_id: str) -> Dict[str, Any]:
    """Generate shipping label PDF (POST /courier/generate/label)."""
    payload = {"shipment_id": [int(shipment_id) if str(shipment_id).isdigit() else shipment_id]}
    res = _shiprocket_request("POST", "/courier/generate/label", json_data=payload)

    resp_block = res.get("response", {}) if isinstance(res.get("response"), dict) else {}
    label_url = (
        res.get("label_url")
        or resp_block.get("label_url")
        or (res.get("data") and res["data"].get("label_url"))
    )

    return {
        "label_url": label_url,
        "raw": res,
    }


def generate_manifest(shipment_id: str) -> Dict[str, Any]:
    """Generate shipping manifest PDF (POST /manifests/generate)."""
    payload = {"shipment_id": [int(shipment_id) if str(shipment_id).isdigit() else shipment_id]}
    res = _shiprocket_request("POST", "/manifests/generate", json_data=payload)

    resp_block = res.get("response", {}) if isinstance(res.get("response"), dict) else {}
    manifest_url = (
        res.get("manifest_url")
        or resp_block.get("manifest_url")
        or (res.get("data") and res["data"].get("manifest_url"))
    )

    return {
        "manifest_url": manifest_url,
        "raw": res,
    }


def track(awb_code: str) -> Dict[str, Any]:
    """Live track shipment by AWB (GET /courier/track/awb/{awb_code})."""
    clean_awb = str(awb_code).strip()
    res = _shiprocket_request("GET", f"/courier/track/awb/{clean_awb}")

    tracking_data = res.get("tracking_data", {})
    shipment_track = tracking_data.get("shipment_track", []) if isinstance(tracking_data, dict) else []
    current_status = None
    if shipment_track and isinstance(shipment_track, list) and len(shipment_track) > 0:
        current_status = shipment_track[0].get("current_status")

    return {
        "awb_code": clean_awb,
        "current_status": current_status,
        "tracking_data": tracking_data,
        "raw": res,
    }


def cancel_order(shiprocket_order_id: Union[str, int]) -> Dict[str, Any]:
    """Cancel order in Shiprocket (POST /orders/cancel)."""
    oid = int(shiprocket_order_id) if str(shiprocket_order_id).isdigit() else shiprocket_order_id
    payload = {"ids": [oid]}
    res = _shiprocket_request("POST", "/orders/cancel", json_data=payload)
    return {
        "shiprocket_order_id": str(shiprocket_order_id),
        "status": "CANCELLED",
        "raw": res,
    }
