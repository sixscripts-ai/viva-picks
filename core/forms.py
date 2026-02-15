from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import Pick


class RegistrationForm(UserCreationForm):
    email = forms.EmailField(required=True)

    class Meta:
        model = User
        fields = ("username", "email", "password1", "password2")


class PickForm(forms.ModelForm):
    class Meta:
        model = Pick
        fields = [
            "title",
            "sport",
            "league",
            "event_datetime",
            "bet",
            "odds",
            "units",
            "analysis",
            "result",
            "is_premium",
        ]
        widgets = {
            "event_datetime": forms.DateTimeInput(attrs={"type": "datetime-local"}),
            "analysis": forms.Textarea(attrs={"rows": 5}),
        }


class PickBroadcastForm(forms.Form):
    subject = forms.CharField(max_length=200)
    message = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 6}))


class EmailTestForm(forms.Form):
    to_email = forms.EmailField()
    subject = forms.CharField(max_length=200)
    message = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 8}))
