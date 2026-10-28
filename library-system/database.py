from datetime import date

from supabase import create_client

DATE_FIELDS = ("requested_at", "borrowed_at", "due_date", "returned_at")


def to_date(value):
    if not value:
        return None
    return date.fromisoformat(str(value)[:10])


class Database:
    def __init__(self, url, key):
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in your .env file.")
        self.client = create_client(url, key)

    def table(self, name):
        return self.client.table(name)

    def call(self, function_name, **params):
        return self.client.rpc(function_name, params).execute().data

    @staticmethod
    def first(rows):
        return rows[0] if rows else None

    @staticmethod
    def fix_dates(row):
        for key in DATE_FIELDS:
            if key in row:
                row[key] = to_date(row[key])
        return row

    @classmethod
    def flatten(cls, row):
        row = dict(row)
        user = row.pop("users", None)
        book = row.pop("books", None)
        if user:
            row["student"] = user.get("name")
            row["student_id"] = user.get("student_id")
        if book:
            row["title"] = book.get("title")
        return cls.fix_dates(row)


class Repository:
    table_name = ""

    def __init__(self, db):
        self.db = db

    @property
    def table(self):
        return self.db.table(self.table_name)


class UserRepository(Repository):
    table_name = "users"

    def find_by_key(self, email_key):
        rows = self.table.select("*").eq("email_key", email_key).limit(1).execute().data
        return Database.first(rows)

    def key_exists(self, email_key):
        return bool(self.table.select("id").eq("email_key", email_key).limit(1).execute().data)

    def create(self, **fields):
        return Database.first(self.table.insert(fields).execute().data)

    def set_password(self, user_id, password_hash):
        self.table.update({"password": password_hash}).eq("id", user_id).execute()

    def set_role(self, user_id, role):
        self.table.update({"role": role}).eq("id", user_id).execute()


class BookRepository(Repository):
    table_name = "books"

    def all(self):
        return self.table.select("*").order("title").execute().data

    def add(self, title, author, copies):
        return self.table.insert({"title": title, "author": author, "copies": copies}).execute().data

    def update(self, book_id, title, author, copies):
        return (self.table.update({"title": title, "author": author, "copies": copies})
                .eq("id", book_id).execute().data)

    def delete(self, book_id):
        return self.table.delete().eq("id", book_id).execute().data


class RequestRepository(Repository):
    table_name = "requests"
    ACTIVE = ["pending", "approved"]

    def pending(self):
        rows = (self.table.select("id, requested_at, users(name), books(title)")
                .eq("status", "pending").order("requested_at").execute().data)
        return [Database.flatten(r) for r in rows]

    def on_loan(self):
        rows = (self.table.select("id, borrowed_at, due_date, status, users(name), books(title)")
                .eq("status", "approved").order("due_date").execute().data)
        return [Database.flatten(r) for r in rows]

    def for_user(self, user_id):
        rows = (self.table.select("*, books(title)")
                .eq("user_id", user_id).order("requested_at", desc=True).execute().data)
        return [Database.flatten(r) for r in rows]

    def active_book_ids(self, user_id):
        rows = self.table.select("book_id").eq("user_id", user_id).in_("status", self.ACTIVE).execute().data
        return {r["book_id"] for r in rows}

    def has_active(self, user_id, book_id):
        rows = (self.table.select("id").eq("user_id", user_id).eq("book_id", book_id)
                .in_("status", self.ACTIVE).limit(1).execute().data)
        return bool(rows)

    def create(self, user_id, book_id):
        return self.table.insert({"user_id": user_id, "book_id": book_id, "status": "pending"}).execute().data

    def approve(self, request_id, today, loan_days):
        return self.db.call("approve_request", p_request_id=request_id,
                            p_today=today.isoformat(), p_loan_days=loan_days)

    def mark_returned(self, request_id, today):
        return self.db.call("return_request", p_request_id=request_id, p_today=today.isoformat())

    def decline(self, request_id):
        rows = (self.table.update({"status": "declined"})
                .eq("id", request_id).eq("status", "pending").execute().data)
        return bool(rows)

    def count_pending(self):
        return self.table.select("id", count="exact").eq("status", "pending").execute().count

    def all_dates(self):
        return self.table.select("requested_at, borrowed_at, returned_at").execute().data

    def borrowed_titles(self):
        rows = (self.table.select("book_id, books(title)")
                .in_("status", ["approved", "returned"]).execute().data)
        return [(r.get("books") or {}).get("title") for r in rows if r.get("books")]

    def activity(self, statuses):
        rows = (self.table
                .select("id, status, borrowed_at, due_date, returned_at, users(name, student_id), books(title)")
                .in_("status", statuses).execute().data)
        return [Database.flatten(r) for r in rows]