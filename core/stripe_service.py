from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import stripe
from django.conf import settings
from django.contrib.auth.models import User

from .models import Subscription, UserProfile


@dataclass(frozen=True)
class StripeKeys:
    secret_key: str
    price_id: str
    product_id: str
    webhook_secret: str
    public_domain: str


def get_stripe_keys() -> StripeKeys:
    return StripeKeys(
        secret_key=settings.STRIPE_SECRET_KEY,
        price_id=settings.STRIPE_PRICE_ID,
        product_id=getattr(settings, "STRIPE_PRODUCT_ID", ""),
        webhook_secret=settings.STRIPE_WEBHOOK_SECRET,
        public_domain=settings.PUBLIC_DOMAIN.rstrip("/"),
    )


def configure_stripe():
    keys = get_stripe_keys()
    stripe.api_key = keys.secret_key
    return keys


def get_or_create_customer(user: User) -> str:
    keys = configure_stripe()
    if not keys.secret_key:
        raise RuntimeError("Stripe is not configured")

    profile, _ = UserProfile.objects.get_or_create(user=user)
    if profile.stripe_customer_id:
        return profile.stripe_customer_id

    customer = stripe.Customer.create(
        email=user.email or None,
        metadata={"user_id": str(user.id), "username": user.get_username()},
    )
    profile.stripe_customer_id = customer["id"]
    profile.save(update_fields=["stripe_customer_id"])
    return profile.stripe_customer_id


def create_checkout_session(user: User) -> str:
    keys = configure_stripe()
    price_id = keys.price_id
    if not price_id and keys.product_id:
        prices = stripe.Price.list(product=keys.product_id, active=True, limit=10).get("data", [])
        recurring_prices = [p for p in prices if p.get("type") == "recurring" and p.get("recurring")]
        if recurring_prices:
            price_id = recurring_prices[0]["id"]

    if not price_id:
        raise RuntimeError("Stripe price is not configured")

    customer_id = get_or_create_customer(user)
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        allow_promotion_codes=True,
        success_url=f"{keys.public_domain}/billing/success/?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{keys.public_domain}/pricing/",
    )
    return session["url"]


def create_billing_portal_session(user: User) -> str:
    keys = configure_stripe()
    customer_id = get_or_create_customer(user)
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{keys.public_domain}/member/dashboard/",
    )
    return session["url"]


def upsert_subscription_from_stripe(
    *, user: User, stripe_subscription: dict
) -> Subscription:
    current_period_end = stripe_subscription.get("current_period_end")
    current_period_end_dt: Optional[datetime] = None
    if current_period_end:
        current_period_end_dt = datetime.fromtimestamp(int(current_period_end), tz=timezone.utc)

    status = stripe_subscription.get("status") or Subscription.Status.INCOMPLETE
    cancel_at_period_end = bool(stripe_subscription.get("cancel_at_period_end", False))
    sub, _ = Subscription.objects.update_or_create(
        user=user,
        defaults={
            "stripe_subscription_id": stripe_subscription.get("id", ""),
            "status": status,
            "current_period_end": current_period_end_dt,
            "cancel_at_period_end": cancel_at_period_end,
        },
    )
    return sub
