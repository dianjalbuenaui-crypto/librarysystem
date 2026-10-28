import os
from datetime import date

from dotenv import load_dotenv
from flask import (Flask, flash, get_template_attribute, jsonify, redirect, render_template, request,
                   session, url_for)

from accounts import AccountService, home_for, login_required
from database import BookRepository, Database, RequestRepository, UserRepository, to_date
from library import Catalog, Loans, Reports
from live import LivePage, keyed, parse_known
from password import PasswordHasher, PasswordPolicy

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY") or os.environ.get("FLASK_SECRET_KEY") or "dcb"
app.config["TEMPLATES_AUTO_RELOAD"] = True


@app.url_defaults
def static_version(endpoint, values):
    if endpoint == "static" and "filename" in values:
        path = os.path.join(app.static_folder, values["filename"])
        if os.path.isfile(path):
            values["v"] = int(os.path.getmtime(path))

LOAN_DAYS = 14
DEFAULT_ADMIN_EMAIL = "admin@library.com"
DEFAULT_ADMIN_PASSWORD = "Admin@123"

db = Database(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))
users = UserRepository(db)
books = BookRepository(db)
borrow_requests = RequestRepository(db)

password_policy = PasswordPolicy()
ALLOWED_EMAIL_DOMAINS = tuple(d.strip().lower() for d in
                              os.environ.get("ALLOWED_EMAIL_DOMAINS", "phinmaed.com").split(",") if d.strip())
accounts = AccountService(users, password_policy, PasswordHasher(),
                          os.environ.get("ADMIN_CODE", "LIBRARY-ADMIN"), ALLOWED_EMAIL_DOMAINS)
catalog = Catalog(books, borrow_requests)
loans = Loans(borrow_requests, LOAN_DAYS)
reports = Reports(borrow_requests)


def wants_json():
    return request.headers.get("X-Requested-With") == "fetch"


def partial(name, *args):
    return str(get_template_attribute("_items.html", name)(*args))


def finish(notice, endpoint, **changes):
    """Answer a background save with just what changed, or fall back to a full page redirect."""
    if wants_json():
        return jsonify(ok=notice.ok, toast=notice.message, **changes)
    flash(notice.message, notice.category)
    return redirect(url_for(endpoint))


@app.template_filter("fmt")
def fmt(d):
    d = to_date(d)
    return d.strftime("%d/%m/%Y") if d else "-"


@app.route("/")
def index():
    home_url = url_for(home_for(session["role"])) if session.get("role") else None
    return render_template("landing.html", home_url=home_url)


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user, problem = accounts.authenticate(request.form.get("email", ""),
                                              request.form.get("password", ""),
                                              request.form.get("role", "user"))
        if problem:
            flash(problem)
        else:
            session.clear()
            session.update(user_id=user["id"], name=user["name"], role=user["role"])
            return redirect(url_for(home_for(user["role"])))
    return render_template("login.html")


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        created, message = accounts.register(request.form)
        flash(message)
        if created:
            return redirect(url_for("login", role=accounts.clean_role(request.form.get("role"))))
    return render_template("signup.html", policy=password_policy,
                           email_domain=ALLOWED_EMAIL_DOMAINS[0], allowed_text=accounts.allowed_text)


@app.route("/api/email-status")
def email_status():
    return jsonify(accounts.email_status(request.args.get("email", "")))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# Each page lists the parts that stay in sync with the database while it is open.
# The same builder renders the page and answers /live/<page>, so both always agree.

def admin_values(pending):
    return {"pending": [{"id": r["id"], "student": r["student"], "title": r["title"]} for r in pending]}


def user_values(history):
    return {"mine": [{"id": h["id"], "status": h["status"], "title": h["title"],
                      "due": h["due_date"].strftime("%d/%m/%Y") if h.get("due_date") else None} for h in history]}


def admin_dashboard_page(q="", show="all"):
    today = date.today()
    summary = reports.monthly_summary(today)
    trend = reports.trend(summary)
    pending = loans.pending()
    counts = reports.loan_counts(today)
    top_books = reports.top_books()
    activity = reports.activity(q, show)
    return LivePage(
        "admin_dashboard", every=10,
        lists={"activity-list": (activity, lambda a: partial("activity_row", a, today))},
        blocks={"admin-stats": lambda: partial("admin_stats", counts, len(pending), summary[-1]),
                "admin-chart": lambda: partial("admin_chart", summary, trend),
                "admin-top": lambda: partial("admin_top", top_books)},
        values=admin_values(pending), activity=activity, q=q, show=show, today=today)


def admin_catalog_page(q=""):
    books = catalog.search(q)
    return LivePage("admin_catalog",
                    lists={"books": (books, lambda b: partial("admin_book", b, b["id"] % 4))},
                    values=admin_values(loans.pending()), books=books, q=q)


def admin_requests_page(q=""):
    today = date.today()
    pending = loans.pending(q)
    on_loan = loans.on_loan(q)
    return LivePage("admin_requests",
                    lists={"pending-list": (pending, lambda r: partial("pending_row", r)),
                           "loans-list": (on_loan, lambda l: partial("loan_row", l, today))},
                    values=admin_values(pending), pending=pending, loans=on_loan, q=q, today=today)


def user_dashboard_page(q=""):
    today = date.today()
    history, stats = loans.history_for(session["user_id"], q)
    return LivePage("user_dashboard",
                    lists={"history": (history, lambda h: partial("history_row", h, today))},
                    blocks={"user-stats": lambda: partial("user_stats", stats)},
                    values=user_values(history), history=history, stats=stats, today=today)


def user_catalog_page(q=""):
    history = loans.requests.for_user(session["user_id"])
    state = {h["book_id"]: h["status"] for h in reversed(history) if h["status"] in ("pending", "approved")}
    books = catalog.search(q)
    for b in books:
        b["state"] = state.get(b["id"])
    return LivePage("user_catalog",
                    lists={"books": (books, lambda b: partial("user_book", b, b["id"] % 4))},
                    values=user_values(history), books=books, q=q)


LIVE_PAGES = {
    "admin_dashboard": ("admin", admin_dashboard_page),
    "admin_catalog": ("admin", admin_catalog_page),
    "admin_requests": ("admin", admin_requests_page),
    "user_dashboard": ("user", user_dashboard_page),
    "user_catalog": ("user", user_catalog_page),
}


def show_page(template, page):
    return render_template(template, page=page, **page.data)


@app.route("/live/<name>")
def live(name):
    role, build = LIVE_PAGES.get(name, (None, None))
    if not build:
        return jsonify(error="unknown page"), 404
    if session.get("role") != role:
        return jsonify(error="signed out"), 401
    page = build()
    out = page.changes(parse_known(request.args.get("h")))
    out.update(values=page.values, every=page.every)
    return jsonify(out)


@app.route("/admin")
@login_required("admin")
def admin_dashboard():
    return show_page("admin-dashboard.html",
                     admin_dashboard_page(request.args.get("q", "").strip(), request.args.get("show", "all")))


@app.route("/admin/catalog")
@login_required("admin")
def admin_catalog():
    return show_page("admin-catalog.html", admin_catalog_page(request.args.get("q", "")))


@app.route("/admin/books/add", methods=["POST"])
@login_required("admin")
def add_book():
    notice = catalog.add(request.form)
    changes = {"add": partial("admin_book", keyed([notice.book])[0], notice.book["id"] % 4)} if notice.ok else {}
    return finish(notice, "admin_catalog", **changes)


@app.route("/admin/books/<int:book_id>/update", methods=["POST"])
@login_required("admin")
def update_book(book_id):
    notice = catalog.update(book_id, request.form)
    changes = {"replace": partial("admin_book", keyed([notice.book])[0], book_id % 4)} if notice.ok else {}
    return finish(notice, "admin_catalog", **changes)


@app.route("/admin/books/<int:book_id>/delete", methods=["POST"])
@login_required("admin")
def delete_book(book_id):
    notice = catalog.delete(book_id)
    return finish(notice, "admin_catalog", remove=notice.ok)


@app.route("/admin/requests")
@login_required("admin")
def admin_requests():
    return show_page("admin-requests.html", admin_requests_page(request.args.get("q", "").strip()))


@app.route("/admin/requests/<int:rid>/<action>", methods=["POST"])
@login_required("admin")
def request_action(rid, action):
    today = date.today()
    notice = loans.handle(rid, action, today)
    changes = {"remove": notice.ok or notice.result in ("not_found", "not_pending", "not_on_loan")}
    loan = loans.loan(rid) if notice.result == "approved" and wants_json() else None
    if loan:
        changes.update(add=partial("loan_row", keyed([loan])[0], today), add_to="loans-list")
    return finish(notice, "admin_requests", **changes)


@app.route("/user")
@login_required("user")
def user_dashboard():
    return show_page("user-dashboard.html", user_dashboard_page(request.args.get("q", "").strip()))


@app.route("/user/catalog")
@login_required("user")
def user_catalog():
    return show_page("user-catalog.html", user_catalog_page(request.args.get("q", "")))


@app.route("/user/request/<int:book_id>", methods=["POST"])
@login_required("user")
def request_borrow(book_id):
    notice = catalog.request_borrow(session["user_id"], book_id)
    return finish(notice, "user_catalog", replace_form=partial("requested_button"))


if __name__ == "__main__":
    print("Templates folder:", os.path.abspath(app.template_folder))
    print("Static folder:   ", os.path.abspath(app.static_folder))
    accounts.ensure_default_admin(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
    app.run(debug=True)