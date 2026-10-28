import hmac
import re

from werkzeug.security import check_password_hash, generate_password_hash


class PasswordPolicy:
    MIN_LENGTH = 8
    MAX_LENGTH = 128

    def __init__(self, min_length=MIN_LENGTH, max_length=MAX_LENGTH):
        self.min_length = min_length
        self.max_length = max_length
        self.requirements = [
            (re.compile(r"[a-z]"), "a lowercase letter"),
            (re.compile(r"[A-Z]"), "an uppercase letter"),
            (re.compile(r"[0-9]"), "a number"),
            (re.compile(r"[^A-Za-z0-9\s]"), "a special character (like ! @ # $ %)"),
        ]

    def missing(self, password):
        missing = []
        if len(password) < self.min_length:
            missing.append(f"at least {self.min_length} characters")
        missing += [label for pattern, label in self.requirements if not pattern.search(password)]
        return missing

    def problem(self, password):
        if len(password) > self.max_length:
            return f"Password must be {self.max_length} characters or fewer."
        missing = self.missing(password)
        if not missing:
            return None
        if len(missing) == 1:
            listed = missing[0]
        else:
            listed = ", ".join(missing[:-1]) + " and " + missing[-1]
        return f"Password needs {listed}."

    def is_strong(self, password):
        return self.problem(password) is None

    @property
    def html_pattern(self):
        return (r"(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s])"
                f".{{{self.min_length},{self.max_length}}}")

    @property
    def hint(self):
        return (f"Use {self.min_length}+ characters with uppercase and lowercase letters, "
                "a number and a special character.")


class PasswordHasher:
    HASH_PREFIXES = ("scrypt:", "pbkdf2:")

    def hash(self, password):
        return generate_password_hash(password)

    def is_hashed(self, stored):
        return bool(stored) and stored.startswith(self.HASH_PREFIXES)

    def verify(self, stored, password):
        if not stored:
            return False
        if self.is_hashed(stored):
            return check_password_hash(stored, password)
        return hmac.compare_digest(stored.encode(), password.encode())

    def needs_upgrade(self, stored):
        return not self.is_hashed(stored)