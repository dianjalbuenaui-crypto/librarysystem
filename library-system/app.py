import os
from datetime import date

from dotenv import load_dotenv
from flask import Flask, flash, jsonify, redirect, render_template, request, session, url_for

from accounts import AccountService, home_for, login_required
from database import BookRepository, Database, RequestRepository, UserRepository, to_date
from library import Catalog, Loans, Reports
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


@app.route("/admin")
@login_required("admin")
def admin_dashboard():
    today = date.today()
    summary = reports.monthly_summary(today)
    q = request.args.get("q", "").strip()
    show = request.args.get("show", "all")
    return render_template("admin-dashboard.html", summary=summary, this_month=summary[-1],
                           waiting=reports.waiting(), activity=reports.activity(q, show),
                           counts=reports.loan_counts(today), top_books=reports.top_books(),
                           trend=reports.trend(summary), q=q, show=show, today=today)


@app.route("/admin/catalog")
@login_required("admin")
def admin_catalog():
    q = request.args.get("q", "")
    return render_template("admin-catalog.html", books=catalog.search(q), q=q)


@app.route("/admin/books/add", methods=["POST"])
@login_required("admin")
def add_book():
    notice = catalog.add(request.form)
    flash(notice.message, notice.category)
    return redirect(url_for("admin_catalog"))


@app.route("/admin/books/<int:book_id>/update", methods=["POST"])
@login_required("admin")
def update_book(book_id):
    notice = catalog.update(book_id, request.form)
    flash(notice.message, notice.category)
    return redirect(url_for("admin_catalog"))


@app.route("/admin/books/<int:book_id>/delete", methods=["POST"])
@login_required("admin")
def delete_book(book_id):
    notice = catalog.delete(book_id)
    flash(notice.message, notice.category)
    return redirect(url_for("admin_catalog"))


@app.route("/admin/requests")
@login_required("admin")
def admin_requests():
    q = request.args.get("q", "").strip()
    return render_template("admin-requests.html", pending=loans.pending(q),
                           loans=loans.on_loan(q), q=q, today=date.today())


@app.route("/admin/requests/<int:rid>/<action>", methods=["POST"])
@login_required("admin")
def request_action(rid, action):
    flash(loans.handle(rid, action, date.today()))
    return redirect(url_for("admin_requests"))


@app.route("/user")
@login_required("user")
def user_dashboard():
    history, stats = loans.history_for(session["user_id"], request.args.get("q", "").strip())
    return render_template("user-dashboard.html", history=history, stats=stats, today=date.today())


@app.route("/user/catalog")
@login_required("user")
def user_catalog():
    q = request.args.get("q", "")
    return render_template("user-catalog.html", books=catalog.search(q), q=q,
                           requested=catalog.requested_by(session["user_id"]))


@app.route("/user/request/<int:book_id>", methods=["POST"])
@login_required("user")
def request_borrow(book_id):
    flash(catalog.request_borrow(session["user_id"], book_id))
    return redirect(url_for("user_catalog"))


if __name__ == "__main__":
    print("Templates folder:", os.path.abspath(app.template_folder))
    print("Static folder:   ", os.path.abspath(app.static_folder))
    accounts.ensure_default_admin(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
    app.run(debug=True)