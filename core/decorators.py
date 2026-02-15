from functools import wraps

from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect

from .models import Subscription


def subscription_required(view_func):
    @login_required
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        try:
            sub = Subscription.objects.get(user=request.user)
        except Subscription.DoesNotExist:
            return redirect("pricing")

        if not sub.is_active:
            return redirect("pricing")

        return view_func(request, *args, **kwargs)

    return _wrapped

