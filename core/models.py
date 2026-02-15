from django.conf import settings
from django.db import models
from django.utils import timezone


class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    stripe_customer_id = models.CharField(max_length=255, blank=True, default="")

    def __str__(self):
        return self.user.get_username()


class Subscription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active"
        TRIALING = "trialing"
        PAST_DUE = "past_due"
        CANCELED = "canceled"
        INCOMPLETE = "incomplete"
        INCOMPLETE_EXPIRED = "incomplete_expired"
        UNPAID = "unpaid"
        PAUSED = "paused"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    stripe_subscription_id = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.INCOMPLETE)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_active(self):
        if self.status not in {self.Status.ACTIVE, self.Status.TRIALING}:
            return False
        if not self.current_period_end:
            return True
        return self.current_period_end >= timezone.now()

    def __str__(self):
        return f"{self.user.get_username()} ({self.status})"


class Pick(models.Model):
    class Result(models.TextChoices):
        OPEN = "open"
        WON = "won"
        LOST = "lost"
        PUSH = "push"

    title = models.CharField(max_length=200)
    sport = models.CharField(max_length=64)
    league = models.CharField(max_length=64, blank=True, default="")
    event_datetime = models.DateTimeField(null=True, blank=True)
    bet = models.CharField(max_length=200)
    odds = models.CharField(max_length=32, blank=True, default="")
    units = models.DecimalField(max_digits=5, decimal_places=2, default=1)
    analysis = models.TextField(blank=True, default="")
    result = models.CharField(max_length=16, choices=Result.choices, default=Result.OPEN)
    is_premium = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-event_datetime", "-created_at"]

    def __str__(self):
        return self.title


class PickBroadcast(models.Model):
    pick = models.ForeignKey(Pick, on_delete=models.CASCADE, related_name="broadcasts")
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    subject = models.CharField(max_length=200)
    message = models.TextField(blank=True, default="")
    recipient_count = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.pick.title} ({self.sent_at:%Y-%m-%d})"
