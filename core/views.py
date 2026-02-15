import stripe
from django.conf import settings
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView, LogoutView
from django.core.mail import EmailMessage
from django.db.models import Q
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .forms import EmailTestForm, PickBroadcastForm, PickForm, RegistrationForm
from .models import Pick, PickBroadcast, Subscription, UserProfile
from .stripe_service import (
    configure_stripe,
    create_billing_portal_session,
    create_checkout_session,
    get_stripe_keys,
    upsert_subscription_from_stripe,
)


@require_GET
def home(request):
    latest_picks = Pick.objects.filter(is_premium=True)[:3]
    return render(request, "core/home.html", {"latest_picks": latest_picks})


@require_GET
def pricing(request):
    return render(request, "core/pricing.html")


@require_http_methods(["GET", "POST"])
def register(request):
    if request.user.is_authenticated:
        return redirect("member_dashboard")

    if request.method == "POST":
        form = RegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect("pricing")
    else:
        form = RegistrationForm()

    return render(request, "core/register.html", {"form": form})


class SignInView(LoginView):
    template_name = "core/login.html"

    def get_success_url(self):
        user = self.request.user
        if user.is_authenticated and user.is_staff:
            return "/admin/dashboard/"
        return "/member/dashboard/"


class SignOutView(LogoutView):
    pass


@login_required
@require_GET
def legacy_dashboard(request):
    return redirect("member_dashboard")


@login_required
@require_GET
def member_dashboard(request):
    subscription = Subscription.objects.filter(user=request.user).first()
    is_active = bool(subscription and subscription.is_active)
    picks = Pick.objects.filter(is_premium=True)[:25]
    broadcasts = PickBroadcast.objects.select_related("pick").all()[:10] if is_active else []
    return render(
        request,
        "core/dashboard.html",
        {
            "subscription": subscription,
            "is_active": is_active,
            "picks": picks,
            "broadcasts": broadcasts,
        },
    )


@login_required
@require_POST
def start_checkout(request):
    try:
        url = create_checkout_session(request.user)
    except RuntimeError as e:
        messages.error(request, str(e))
        return redirect("pricing")
    return redirect(url)


@login_required
@require_POST
def billing_portal(request):
    try:
        url = create_billing_portal_session(request.user)
    except RuntimeError as e:
        messages.error(request, str(e))
        return redirect("member_dashboard")
    return redirect(url)


@login_required
@require_GET
def billing_success(request):
    session_id = request.GET.get("session_id", "")
    if session_id:
        keys = configure_stripe()
        if keys.secret_key:
            try:
                session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
                subscription = session.get("subscription")
                if subscription:
                    upsert_subscription_from_stripe(user=request.user, stripe_subscription=subscription)
            except Exception:
                pass

    messages.success(request, "Subscription activated. Welcome to Viva Picks.")
    return redirect("member_dashboard")


def _active_subscriptions():
    now = timezone.now()
    return Subscription.objects.filter(
        status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING]
    ).filter(Q(current_period_end__isnull=True) | Q(current_period_end__gte=now))


@csrf_exempt
@require_POST
def stripe_webhook(request):
    keys = get_stripe_keys()
    if not keys.webhook_secret:
        return HttpResponseBadRequest("Stripe webhook is not configured")

    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
    configure_stripe()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=sig_header, secret=keys.webhook_secret
        )
    except ValueError:
        return HttpResponseBadRequest("Invalid payload")
    except stripe.error.SignatureVerificationError:
        return HttpResponseBadRequest("Invalid signature")

    event_type = event.get("type", "")
    data_object = event.get("data", {}).get("object", {})

    if event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        customer_id = data_object.get("customer")
        if customer_id:
            profile = UserProfile.objects.filter(stripe_customer_id=customer_id).select_related("user").first()
            if profile:
                upsert_subscription_from_stripe(user=profile.user, stripe_subscription=data_object)

    if event_type == "checkout.session.completed":
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")
        if customer_id and subscription_id:
            profile = UserProfile.objects.filter(stripe_customer_id=customer_id).select_related("user").first()
            if profile:
                try:
                    subscription = stripe.Subscription.retrieve(subscription_id)
                    upsert_subscription_from_stripe(user=profile.user, stripe_subscription=subscription)
                except Exception:
                    pass

    return HttpResponse(status=200)


@staff_member_required
@require_GET
def legacy_admin_dashboard(request):
    return redirect("admin_dashboard")


@staff_member_required
@require_GET
def admin_dashboard(request):
    picks = Pick.objects.all()[:50]
    subs = (
        Subscription.objects.select_related("user")
        .order_by("-updated_at")[:50]
    )
    broadcasts = PickBroadcast.objects.select_related("pick", "sent_by").all()[:25]
    active_subscriber_count = _active_subscriptions().count()
    return render(
        request,
        "core/admin/dashboard.html",
        {
            "picks": picks,
            "subs": subs,
            "broadcasts": broadcasts,
            "active_subscriber_count": active_subscriber_count,
        },
    )


@staff_member_required
@require_http_methods(["GET", "POST"])
def admin_pick_create(request):
    if request.method == "POST":
        form = PickForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, "Pick created.")
            return redirect("admin_dashboard")
    else:
        form = PickForm()

    return render(request, "core/admin/pick_form.html", {"form": form, "mode": "create"})


@staff_member_required
@require_http_methods(["GET", "POST"])
def admin_pick_edit(request, pick_id: int):
    pick = get_object_or_404(Pick, id=pick_id)
    if request.method == "POST":
        form = PickForm(request.POST, instance=pick)
        if form.is_valid():
            form.save()
            messages.success(request, "Pick updated.")
            return redirect("admin_dashboard")
    else:
        form = PickForm(instance=pick)

    return render(
        request,
        "core/admin/pick_form.html",
        {"form": form, "mode": "edit", "pick": pick},
    )


@staff_member_required
@require_http_methods(["GET", "POST"])
def admin_pick_delete(request, pick_id: int):
    pick = get_object_or_404(Pick, id=pick_id)
    if request.method == "POST":
        pick.delete()
        messages.success(request, "Pick deleted.")
        return redirect("admin_dashboard")

    return render(request, "core/admin/pick_delete.html", {"pick": pick})


@staff_member_required
@require_http_methods(["GET", "POST"])
def admin_pick_send(request, pick_id: int):
    pick = get_object_or_404(Pick, id=pick_id)
    emails = list(
        _active_subscriptions()
        .exclude(user__email__isnull=True)
        .exclude(user__email="")
        .values_list("user__email", flat=True)
        .distinct()
    )

    dashboard_url = f"{settings.PUBLIC_DOMAIN.rstrip('/')}/member/dashboard/"
    default_subject = f"Viva Picks: {pick.title}"
    default_message = "\n".join(
        [
            f"{pick.sport}{' · ' + pick.league if pick.league else ''}",
            f"Pick: {pick.title}",
            f"Bet: {pick.bet}",
            f"Odds: {pick.odds or '—'}",
            f"Units: {pick.units}",
            "",
            pick.analysis.strip() if pick.analysis else "",
            "",
            f"View in dashboard: {dashboard_url}",
        ]
    ).strip()

    if request.method == "POST":
        form = PickBroadcastForm(request.POST)
        if form.is_valid():
            subject = form.cleaned_data["subject"]
            message = form.cleaned_data["message"] or default_message

            sent = 0
            chunk_size = 50
            for i in range(0, len(emails), chunk_size):
                chunk = emails[i : i + chunk_size]
                email = EmailMessage(
                    subject=subject,
                    body=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[],
                    bcc=chunk,
                )
                sent += email.send(fail_silently=False)

            PickBroadcast.objects.create(
                pick=pick,
                sent_by=request.user,
                subject=subject,
                message=message,
                recipient_count=len(emails),
            )

            messages.success(request, f"Sent to {len(emails)} subscribers.")
            return redirect("admin_dashboard")
    else:
        form = PickBroadcastForm(initial={"subject": default_subject, "message": default_message})

    return render(
        request,
        "core/admin/pick_send.html",
        {
            "pick": pick,
            "form": form,
            "recipient_count": len(emails),
        },
    )


@staff_member_required
@require_GET
def admin_health(request):
    stripe_keys = {
        "STRIPE_SECRET_KEY": bool(settings.STRIPE_SECRET_KEY),
        "STRIPE_PUBLISHABLE_KEY": bool(getattr(settings, "STRIPE_PUBLISHABLE_KEY", "")),
        "STRIPE_PRICE_ID": bool(settings.STRIPE_PRICE_ID),
        "STRIPE_PRODUCT_ID": bool(getattr(settings, "STRIPE_PRODUCT_ID", "")),
        "STRIPE_WEBHOOK_SECRET": bool(settings.STRIPE_WEBHOOK_SECRET),
    }
    email_keys = {
        "EMAIL_BACKEND": settings.EMAIL_BACKEND,
        "DEFAULT_FROM_EMAIL": settings.DEFAULT_FROM_EMAIL,
        "EMAIL_HOST": bool(getattr(settings, "EMAIL_HOST", "")),
        "EMAIL_HOST_USER": bool(getattr(settings, "EMAIL_HOST_USER", "")),
        "EMAIL_PORT": getattr(settings, "EMAIL_PORT", None),
        "EMAIL_USE_TLS": getattr(settings, "EMAIL_USE_TLS", None),
        "EMAIL_USE_SSL": getattr(settings, "EMAIL_USE_SSL", None),
    }
    return render(
        request,
        "core/admin/health.html",
        {
            "stripe_keys": stripe_keys,
            "email_keys": email_keys,
            "public_domain": settings.PUBLIC_DOMAIN,
            "webhook_path": "/stripe/webhook/",
        },
    )


@staff_member_required
@require_http_methods(["GET", "POST"])
def admin_email_test(request):
    if request.method == "POST":
        form = EmailTestForm(request.POST)
        if form.is_valid():
            email = EmailMessage(
                subject=form.cleaned_data["subject"],
                body=form.cleaned_data["message"] or "",
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[form.cleaned_data["to_email"]],
            )
            email.send(fail_silently=False)
            messages.success(request, "Test email sent.")
            return redirect("admin_email_test")
    else:
        form = EmailTestForm(
            initial={
                "subject": "Viva Picks test email",
                "message": "If you received this, email sending is configured correctly.",
            }
        )

    return render(request, "core/admin/email_test.html", {"form": form})
