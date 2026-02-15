from django.contrib import admin

from .models import Pick, PickBroadcast, Subscription, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "stripe_customer_id")
    search_fields = ("user__username", "user__email", "stripe_customer_id")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "current_period_end", "cancel_at_period_end", "updated_at")
    search_fields = ("user__username", "user__email", "stripe_subscription_id")
    list_filter = ("status", "cancel_at_period_end")


@admin.register(Pick)
class PickAdmin(admin.ModelAdmin):
    list_display = ("title", "sport", "league", "event_datetime", "result", "is_premium", "created_at")
    search_fields = ("title", "sport", "league", "bet")
    list_filter = ("sport", "result", "is_premium")


@admin.register(PickBroadcast)
class PickBroadcastAdmin(admin.ModelAdmin):
    list_display = ("pick", "sent_at", "recipient_count", "sent_by")
    search_fields = ("pick__title", "subject")
