from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("pricing/", views.pricing, name="pricing"),
    path("register/", views.register, name="register"),
    path("login/", views.SignInView.as_view(), name="login"),
    path("logout/", views.SignOutView.as_view(), name="logout"),
    path("dashboard/", views.legacy_dashboard, name="dashboard"),
    path("member/dashboard/", views.member_dashboard, name="member_dashboard"),
    path("billing/checkout/", views.start_checkout, name="start_checkout"),
    path("billing/portal/", views.billing_portal, name="billing_portal"),
    path("billing/success/", views.billing_success, name="billing_success"),
    path("stripe/webhook/", views.stripe_webhook, name="stripe_webhook"),
    path("admin-dashboard/", views.legacy_admin_dashboard, name="legacy_admin_dashboard"),
    path("admin/dashboard/", views.admin_dashboard, name="admin_dashboard"),
    path("admin/dashboard/picks/new/", views.admin_pick_create, name="admin_pick_create"),
    path(
        "admin/dashboard/picks/<int:pick_id>/edit/",
        views.admin_pick_edit,
        name="admin_pick_edit",
    ),
    path(
        "admin/dashboard/picks/<int:pick_id>/delete/",
        views.admin_pick_delete,
        name="admin_pick_delete",
    ),
    path(
        "admin/dashboard/picks/<int:pick_id>/send/",
        views.admin_pick_send,
        name="admin_pick_send",
    ),
    path("admin/dashboard/health/", views.admin_health, name="admin_health"),
    path("admin/dashboard/email/test/", views.admin_email_test, name="admin_email_test"),
]
