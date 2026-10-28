import unicodedata
from datetime import date

from postgrest.exceptions import APIError

from database import to_date

NOT_SAVED = ("Nothing was saved. The database did not change any rows. "
             "Check the Row Level Security policies on the books table in Supabase.")


class SearchText:
    @staticmethod
    def normalize(text):
        text = unicodedata.normalize("NFKD", str(text or ""))
        return " ".join("".join(c for c in text if not unicodedata.combining(c)).casefold().split())

    @classmethod
    def build(cls, *parts):
        return cls.normalize(" ".join(str(p) for p in parts if p))

    @classmethod
    def matches(cls, haystack, query):
        return all(word in haystack for word in cls.normalize(query).split())


def with_search(rows, query, *fields):
    for row in rows:
        row["search"] = SearchText.build(*(row.get(f) for f in fields))
        row["visible"] = SearchText.matches(row["search"], query)
    return rows


class Notice:
    def __init__(self, ok, title, body):
        self.ok = ok
        self.title = title
        self.body = body

    @property
    def category(self):
        return "toast-success" if self.ok else "toast-error"

    @property
    def message(self):
        return {"title": self.title, "body": self.body}


def copies_text(count):
    return f"{count} cop{'y' if count == 1 else 'ies'}"


class Catalog:
    def __init__(self, books, requests):
        self.books = books
        self.requests = requests

    def search(self, query=""):
        books = sorted(self.books.all(), key=lambda b: SearchText.normalize(b.get("title")))
        return with_search(books, query, "title", "author")

    @staticmethod
    def _details(form):
        return form["title"].strip(), form["author"].strip(), max(0, int(form["copies"]))

    def add(self, form):
        try:
            title, author, copies = self._details(form)
        except ValueError:
            return Notice(False, "Book not added", "Copies must be a whole number.")
        if not self.books.add(title, author, copies):
            return Notice(False, "Book not added", NOT_SAVED)
        return Notice(True, "Book added", f"“{title}” is now in the catalog with {copies_text(copies)}.")

    def update(self, book_id, form):
        try:
            title, author, copies = self._details(form)
        except ValueError:
            return Notice(False, "Changes not saved", "Copies must be a whole number.")
        if not self.books.update(book_id, title, author, copies):
            return Notice(False, "Changes not saved", NOT_SAVED)
        return Notice(True, "Book updated", f"Changes to “{title}” were saved. {copies_text(copies).capitalize()} available.")

    def delete(self, book_id):
        deleted = self.books.delete(book_id)
        if not deleted:
            return Notice(False, "Book not deleted", NOT_SAVED)
        title = deleted[0].get("title") or "The book"
        return Notice(True, "Book deleted", f"“{title}” was removed from the catalog.")

    def requested_by(self, user_id):
        return self.requests.active_book_ids(user_id)

    def request_borrow(self, user_id, book_id):
        if self.requests.has_active(user_id, book_id):
            return "You already requested or borrowed this book."
        self.requests.create(user_id, book_id)
        return "Borrow request sent. Wait for admin approval."


class Loans:
    MESSAGES = {
        "approved": "Request approved.",
        "declined": "Request declined.",
        "returned": "Book marked as returned.",
        "no_copies": "No copies left to lend.",
        "not_found": "That request no longer exists.",
        "not_pending": "That request was already handled.",
        "not_on_loan": "That book is not out on loan.",
    }

    def __init__(self, requests, loan_days):
        self.requests = requests
        self.loan_days = loan_days

    def pending(self, query=""):
        return with_search(self.requests.pending(), query, "student", "title")

    def on_loan(self, query=""):
        return with_search(self.requests.on_loan(), query, "student", "title")

    def handle(self, request_id, action, today):
        try:
            if action == "approve":
                result = self.requests.approve(request_id, today, self.loan_days)
            elif action == "return":
                result = self.requests.mark_returned(request_id, today)
            elif action == "decline":
                result = "declined" if self.requests.decline(request_id) else "not_pending"
            else:
                result = None
        except APIError as e:
            return f"The database rejected the change: {e.message or e}"
        return self.MESSAGES.get(result, "Nothing changed. Refresh the page and try again.")

    def history_for(self, user_id, query=""):
        history = with_search(self.requests.for_user(user_id), query, "title")
        out = [h for h in history if h["status"] == "approved"]
        stats = {
            "borrowed": len(out),
            "pending": sum(1 for h in history if h["status"] == "pending"),
            "returned": sum(1 for h in history if h["status"] == "returned"),
            "next_due": min((h["due_date"] for h in out if h["due_date"]), default=None),
        }
        return history, stats


class Reports:
    ACTIVITY_LIMIT = 1000

    def __init__(self, requests):
        self.requests = requests

    @staticmethod
    def last_months(today, count=6):
        months = []
        y, m = today.year, today.month
        for _ in range(count):
            months.insert(0, (y, m))
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        return months

    def monthly_summary(self, today):
        months = self.last_months(today)
        start = date(months[0][0], months[0][1], 1)
        rows = self.requests.all_dates()

        def per_month(column):
            counts = {}
            for r in rows:
                d = to_date(r[column])
                if d and d >= start:
                    counts[(d.year, d.month)] = counts.get((d.year, d.month), 0) + 1
            return counts

        requested = per_month("requested_at")
        borrowed = per_month("borrowed_at")
        returned = per_month("returned_at")

        summary = [{"label": date(y, m, 1).strftime("%b %Y"),
                    "requested": requested.get((y, m), 0),
                    "borrowed": borrowed.get((y, m), 0),
                    "returned": returned.get((y, m), 0)} for y, m in months]

        top = max([1] + [row["borrowed"] for row in summary])
        for row in summary:
            row["borrowed_pct"] = round(row["borrowed"] * 100 / top)
            row["short"] = row["label"].split(" ")[0]
        return summary

    @staticmethod
    def books_word(n):
        return f"{n} book{'' if n == 1 else 's'}"

    def trend(self, summary):
        now, before = summary[-1]["borrowed"], summary[-2]["borrowed"]
        this_month = f"{self.books_word(now)} borrowed so far this month"
        if now > before:
            return this_month, f"{now - before} more than last month"
        if now < before:
            return this_month, f"{before - now} fewer than last month"
        return this_month, "the same as last month"

    def loan_counts(self, today):
        loans = self.requests.on_loan()
        overdue = sum(1 for l in loans if l.get("due_date") and l["due_date"] < today)
        due_today = sum(1 for l in loans if l.get("due_date") == today)
        return {"on_loan": len(loans), "overdue": overdue, "due_today": due_today}

    def top_books(self, limit=5):
        counts = {}
        for title in self.requests.borrowed_titles():
            counts[title] = counts.get(title, 0) + 1
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], SearchText.normalize(kv[0])))[:limit]
        top = ranked[0][1] if ranked else 1
        return [{"title": t, "count": c, "pct": round(c * 100 / top)} for t, c in ranked]

    def waiting(self):
        return self.requests.count_pending()

    def activity(self, query, show):
        rows = with_search(self.requests.activity(["approved", "returned"]), query, "student", "student_id", "title")
        for row in rows:
            row["group"] = "borrowed" if row["status"] == "approved" else "returned"
            if show in ("borrowed", "returned") and row["group"] != show:
                row["visible"] = False
        rows.sort(key=lambda a: (a["borrowed_at"] or a["requested_at"] or date.min, a["id"]), reverse=True)
        return rows[:self.ACTIVITY_LIMIT]