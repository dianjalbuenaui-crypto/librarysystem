import hmac
import re
from functools import wraps

from flask import flash, redirect, session, url_for
from postgrest.exceptions import APIError

from email_address import EmailAddress

HOME_PAGES = {"admin": "admin_dashboard", "user": "user_dashboard"}


def home_for(role):
    return HOME_PAGES.get(role, "login")


def login_required(role):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            current = session.get("role")
            if current != role:
                if current:
                    flash("You do not have access to that page.")
                    return redirect(url_for(home_for(current)))
                flash("Please log in first.")
                return redirect(url_for("login"))
            return func(*args, **kwargs)
        return wrapper
    return decorator


class SchoolId:
    EXAMPLE = "2526-125232"
    ALLOWED = re.compile(r"^[\d\s-]+$")

    def __init__(self, raw):
        self.raw = (raw or "").strip()
        self.digits = re.sub(r"\D", "", self.raw)

    @property
    def is_valid(self):
        return bool(self.ALLOWED.match(self.raw)) and len(self.digits) == 10

    @property
    def value(self):
        return f"{self.digits[:4]}-{self.digits[4:]}" if self.is_valid else self.raw

    @property
    def problem(self):
        if not self.raw:
            return "Please enter your student or staff ID."
        if not self.ALLOWED.match(self.raw):
            return f"Your ID can only contain numbers, like {self.EXAMPLE}."
        if len(self.digits) != 10:
            return f"Your ID must have exactly 10 digits, like {self.EXAMPLE}. You entered {len(self.digits)}."
        return None


class AccountService:
    def __init__(self, users, policy, hasher, admin_code, allowed_domains=("phinmaed.com",)):
        self.users = users
        self.policy = policy
        self.hasher = hasher
        self.admin_code = admin_code
        self.allowed_domains = tuple(d.lower() for d in allowed_domains)

    @property
    def allowed_text(self):
        endings = [f"@{d}" for d in self.allowed_domains]
        if len(endings) == 1:
            return endings[0]
        return ", ".join(endings[:-1]) + " or " + endings[-1]

    @staticmethod
    def clean_role(value):
        return "admin" if value == "admin" else "user"

    def email_status(self, raw_email):
        email = EmailAddress(raw_email)
        if not email.is_valid:
            return {"status": "invalid", "message": "Enter a valid email address."}
        if not email.belongs_to(self.allowed_domains):
            return {"status": "not_allowed",
                    "message": f"Only PHINMA Education emails can be used. Use your email ending in {self.allowed_text}."}
        if not email.has_plain_name:
            return {"status": "not_allowed",
                    "message": "Enter your PHINMA Education email exactly as it was given to you, without a + or spaces."}
        existing = self.users.find_by_key(email.key)
        if existing:
            stored = (existing.get("email") or "").lower()
            if email.is_gmail and stored != email.address:
                message = ("This Gmail account is already registered. Gmail ignores dots and "
                           "anything after a +, so this counts as the same address.")
            else:
                message = "This PHINMA Education email is already registered."
            return {"status": "taken", "message": message}
        return {"status": "available", "message": "This email is available."}

    def register(self, form):
        role = self.clean_role(form.get("role"))
        name = form.get("fullname", "").strip()
        student_id = form.get("student_id", "").strip()
        email = EmailAddress(form.get("email"))
        password = form.get("password", "")

        if not name:
            return False, "Please fill in your full name."
        school_id = SchoolId(student_id)
        if school_id.problem:
            return False, school_id.problem
        student_id = school_id.value
        status = self.email_status(email.address)
        if status["status"] != "available":
            return False, status["message"]
        if password != form.get("confirm", ""):
            return False, "Passwords do not match."
        problem = self.policy.problem(password)
        if problem:
            return False, problem
        if role == "admin" and not hmac.compare_digest(
                form.get("admin_code", "").encode(), self.admin_code.encode()):
            return False, "Wrong admin access code."

        try:
            created = self.users.create(
                name=name,
                student_id=student_id,
                email=email.address,
                email_key=email.key,
                password=self.hasher.hash(password),
                role=role,
            )
        except APIError as e:
            if e.code == "23505":
                return False, "This PHINMA Education email is already registered."
            raise
        if not created:
            return False, ("The account could not be saved. Check the Row Level Security "
                           "policies on the users table in Supabase.")
        return True, "Account created. Please log in."

    def authenticate(self, raw_email, password, role):
        role = self.clean_role(role)
        email = EmailAddress(raw_email)
        user = self.users.find_by_key(email.key) if email.is_valid else None
        if not user or not self.hasher.verify(user.get("password"), password):
            return None, "Wrong email or password."
        if user["role"] != role:
            if user["role"] == "admin":
                return None, "This is an admin account. Choose 'Admin' to log in."
            return None, "This is a borrower account. Choose 'Borrower' to log in."
        if self.hasher.needs_upgrade(user["password"]):
            self.users.set_password(user["id"], self.hasher.hash(password))
        return user, None

    def ensure_default_admin(self, email, password):
        address = EmailAddress(email)
        user = self.users.find_by_key(address.key)
        if not user:
            self.users.create(name="Admin", student_id="ADMIN", email=address.address,
                              email_key=address.key, password=self.hasher.hash(password), role="admin")
        elif user["role"] != "admin":
            self.users.set_role(user["id"], "admin")
        print(f"Default admin ready -> {address} / {password}")