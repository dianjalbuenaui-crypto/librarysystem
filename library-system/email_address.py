import re


class EmailAddress:
    PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    WORKSPACE_NAME = re.compile(r"^[a-z0-9][a-z0-9._'-]*$")
    GMAIL_DOMAINS = ("gmail.com", "googlemail.com")
    MAX_LENGTH = 254

    def __init__(self, raw):
        self.address = (raw or "").strip().lower()

    def __str__(self):
        return self.address

    @property
    def is_valid(self):
        return len(self.address) <= self.MAX_LENGTH and bool(self.PATTERN.match(self.address))

    @property
    def domain(self):
        return self.address.rsplit("@", 1)[-1] if "@" in self.address else ""

    @property
    def local(self):
        return self.address.rsplit("@", 1)[0] if "@" in self.address else self.address

    def belongs_to(self, domains):
        return self.domain in domains

    @property
    def has_plain_name(self):
        return bool(self.WORKSPACE_NAME.match(self.local))

    @property
    def is_gmail(self):
        return self.domain in self.GMAIL_DOMAINS

    @property
    def key(self):
        if not self.is_valid:
            return self.address
        local, domain = self.address.rsplit("@", 1)
        if domain in self.GMAIL_DOMAINS:
            local = local.split("+", 1)[0].replace(".", "")
            domain = "gmail.com"
        return f"{local}@{domain}"

    def same_inbox_as(self, other):
        return self.key == EmailAddress(other).key