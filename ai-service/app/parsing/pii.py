"""Personal data of a CV: contacts masked before the LLM, and code-made masked copies after it
(US-2.4 AC-5 to AC-7, BR-03, NFR-3, CONTEXT D37).

1. `mask_contacts` replaces emails and Vietnamese phone numbers in the CV text with numbered
   tokens ([EMAIL_1], [PHONE_1]) before the prompt is built; the values go straight to `pii`.
2. After the LLM, `build_pii` merges those values with the personal section it returned, and
   `unmask` puts the real values back into the profile, so the student reviews their own text.
3. `mask_text` replaces every personal value left in free text with a typed token ([NAME],
   [EMAIL], [PHONE], [LINK], [ADDRESS], [DOB], [HOMETOWN], [RELIGION]); `mask_profile` does it
   for every string of a profile. Matching ignores case and Vietnamese diacritics ("Nguyễn Văn An",
   "NGUYEN VAN AN", "nguyenvanan"), keeps word boundaries, and tries the name in both orders.
4. Gender and marital status are codes in `pii`, never matched as text: "Nam" is also in
   "Việt Nam". Lines labelled with a personal field ("Giới tính: Nam") lose their value instead.
5. `find_pii` is the final check: anything it still finds means masking failed.

Every function is pure and deterministic, so US-2.6 can rebuild `profile_masked` after the student
edits the profile, and packages/shared/contracts/fixtures/pii-mask-cases.json tests both sides.
"""

import re
import unicodedata
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from app.contracts.cv_pii import CvPii
from app.contracts.cv_profile import CvProfile

EMAIL = re.compile(
    r"(?<![\w.%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])"
)
PHONE = re.compile(r"(?<![\w+])(?:\(?\+84\)?[\s.-]?|0)\d(?:[\s.-]?\d){8,9}(?!\d)")
"""A Vietnamese mobile or landline number: 0 or +84, then 9 or 10 digits, spaced or not."""
DIGIT_RUN = re.compile(r"(?<![\w+])\+?\(?\d[\d \t.()-]{7,}\d(?!\d)")
"""Any number long enough to be a phone number, for comparing digits with the known ones."""
URL_TAIL = r"[^\s<>\"')\]]*[^\s<>\"')\].,;:!?]"
"""The rest of a link, without the punctuation of the sentence around it."""
URL = re.compile(
    rf"(?:https?://|www\.){URL_TAIL}"
    r"|(?<![\w.@/])(?:github|gitlab|bitbucket|linkedin|facebook|fb|behance|dribbble)\.(?:com|me)"
    rf"/{URL_TAIL}",
    re.IGNORECASE,
)
CONTACT_TOKEN = re.compile(r"\[(EMAIL|PHONE)_\d+\]")
MASK_TOKEN = re.compile(r"\[[A-Z][A-Z_0-9]*\]")
"""Any token this module writes: [NAME], [EMAIL_1], [MARITAL_STATUS]..."""
ONLY_TOKENS = re.compile(r"(?:\[[A-Z_0-9]+\][\s,;|/.-]*)+")

NAME, EMAIL_TOKEN, PHONE_TOKEN, LINK = "[NAME]", "[EMAIL]", "[PHONE]", "[LINK]"
ADDRESS, DOB, HOMETOWN, RELIGION = "[ADDRESS]", "[DOB]", "[HOMETOWN]", "[RELIGION]"
GENDER, MARITAL_STATUS = "[GENDER]", "[MARITAL_STATUS]"

# A labelled personal field at the start of a line: its value is masked up to the end of the line.
# Labels are matched on folded text (no case, no diacritics).
LABELS: dict[str, tuple[str, ...]] = {
    NAME: ("ho va ten", "ho ten", "full name"),
    GENDER: ("gioi tinh", "gender", "sex"),
    MARITAL_STATUS: ("tinh trang hon nhan", "hon nhan", "marital status"),
    DOB: ("ngay thang nam sinh", "ngay sinh", "nam sinh", "date of birth", "birthday", "dob"),
    HOMETOWN: ("que quan", "nguyen quan", "que", "hometown", "place of origin"),
    RELIGION: ("ton giao", "religion"),
    ADDRESS: ("dia chi", "noi o", "cho o", "address"),
}
LABELLED = re.compile(
    r"(?m)^[ \t]*(?:[-*•·+][ \t]*)?(?P<label>"
    + "|".join(
        sorted(
            (re.escape(label) for labels in LABELS.values() for label in labels),
            key=len,
            reverse=True,
        )
    )
    + r")(?:[ \t]+hien[ \t]+tai)?[ \t]*(?:[:：\-–][ \t]*|\t+)(?P<value>\S[^\n]*)$"
)
NONE_VALUES = frozenset(
    {"", "-", "khong", "khong co", "khong ro", "chua", "none", "n/a", "na", "null", "unknown"}
)
LINK_PREFIXES = frozenset({"in", "pub", "u", "user", "users", "profile", "people", "@"})
MIN_LOCAL_PART = 4
"""Shorter email local parts and usernames ("an", "vn") are too common to mask as words."""
NAME_GAP = r"(?:\s+|[._-]?)"
"""Between the words of a name: spaces, or nothing as in "nguyenvanan", or one dot, dash or
underscore. Never " - ": that separates two names, not the words of one."""


# --- folding --------------------------------------------------------------------------------


def fold(text: str) -> tuple[str, list[int]]:
    """Lower case without diacritics ("Đặng" -> "dang"), and for each folded character the index
    of the original character it came from."""
    folded: list[str] = []
    origin: list[int] = []
    for index, char in enumerate(text):
        for part in unicodedata.normalize("NFD", char.replace("đ", "d").replace("Đ", "D")):
            if unicodedata.combining(part):
                continue
            for lower in part.lower():
                folded.append(lower)
                origin.append(index)
    return "".join(folded), origin


def folded(text: str) -> str:
    return fold(text)[0]


# --- 1. contacts before the LLM ---------------------------------------------------------------


@dataclass(frozen=True)
class MaskedContacts:
    text: str
    """The CV text with each email and phone number replaced by its numbered token."""
    tokens: dict[str, str]
    """Token -> the value it replaced, e.g. "[EMAIL_1]" -> "an@example.com"."""

    @property
    def emails(self) -> list[str]:
        return [value for token, value in self.tokens.items() if token.startswith("[EMAIL_")]

    @property
    def phones(self) -> list[str]:
        return [value for token, value in self.tokens.items() if token.startswith("[PHONE_")]


def mask_contacts(text: str) -> MaskedContacts:
    """AC-5: emails and phone numbers out of the text sent to the LLM. The same address
    written twice gets the same token."""
    tokens: dict[str, str] = {}
    by_key: dict[str, str] = {}

    def token_for(kind: str, value: str, key: str) -> str:
        if key not in by_key:
            token = f"[{kind}_{sum(t.startswith(f'[{kind}_') for t in tokens) + 1}]"
            by_key[key] = token
            tokens[token] = value
        return by_key[key]

    masked = EMAIL.sub(lambda m: token_for("EMAIL", m[0], m[0].lower()), text)
    masked = PHONE.sub(lambda m: token_for("PHONE", m[0].strip(), phone_key(m[0])), masked)
    return MaskedContacts(masked, tokens)


def phone_key(value: str) -> str:
    """Digits of a phone number, with +84 read as 0: "+84 912.345.678" -> "0912345678"."""
    digits = re.sub(r"\D", "", value)
    if digits.startswith("84") and len(digits) in (11, 12):
        digits = "0" + digits[2:]
    return digits


def unmask(value: Any, tokens: dict[str, str]) -> Any:
    """`value` (a string, list or dict, nested) with every contact token replaced by its value."""
    if not tokens:
        return value
    return _map_strings(
        value, lambda text: CONTACT_TOKEN.sub(lambda m: tokens.get(m[0], m[0]), text)
    )


# --- 2. the personal section ------------------------------------------------------------------


def build_pii(personal: CvPii, contacts: MaskedContacts, *, has_photo: bool | None) -> CvPii:
    """The personal section to store: the LLM's reading with tokens put back, the contacts found by
    regex added, duplicates and "none" values dropped. `has_photo` from the file overrides the
    LLM's guess, which cannot see images in a text CV."""
    data = unmask(personal.model_dump(mode="json"), contacts.tokens)
    for field in ("full_name", "address", "date_of_birth", "hometown", "religion"):
        data[field] = _value(data[field])
    data["emails"] = _distinct([*contacts.emails, *data["emails"]], str.lower, "@")
    data["phones"] = _distinct([*contacts.phones, *data["phones"]], phone_key)
    data["phones"] = [phone for phone in data["phones"] if len(phone_key(phone)) >= 9]
    data["links"] = _distinct(data["links"], _link_key)
    if has_photo is not None:
        data["has_photo"] = has_photo
    return CvPii.model_validate(data)


def _value(value: str | None) -> str | None:
    if value is None or folded(value).strip(" .") in NONE_VALUES:
        return None
    return value.strip()


def _distinct(values: Iterable[str], key: Callable[[str], str], needs: str = "") -> list[str]:
    seen: set[str] = set()
    kept: list[str] = []
    for value in values:
        value = value.strip()
        if not value or CONTACT_TOKEN.fullmatch(value) or needs not in value:
            continue
        if key(value) not in seen:
            seen.add(key(value))
            kept.append(value)
    return kept


def _link_key(link: str) -> str:
    return re.sub(r"^(?:https?://)?(?:www\.)?", "", link.strip().lower()).rstrip("/")


# --- 3. masking -------------------------------------------------------------------------------


@dataclass(frozen=True)
class _Pattern:
    regex: re.Pattern[str]
    token: str
    on_folded: bool
    """Matched against the folded text (personal values), or the original (generic formats)."""


def _patterns(pii: CvPii) -> list[_Pattern]:
    found: list[_Pattern] = []

    def add_value(value: str | None, token: str, gap: str = r"\s+") -> None:
        words = folded(value or "").split()
        if words:
            found.append(_folded(gap.join(re.escape(word) for word in words), token))

    name = _root(pii.full_name)
    if name:
        words = name.split()
        orders = {tuple(words), (*words[-1:], *words[:-1])}
        if len(words) >= 3:
            orders |= {(words[0], words[-1]), (words[-1], words[0])}
        for order in orders:
            add_value(" ".join(order), NAME, NAME_GAP)
    for email in (_root(e) for e in pii.emails):
        add_value(email, EMAIL_TOKEN)
        local = email.split("@", 1)[0]
        if len(local) >= MIN_LOCAL_PART:
            add_value(local, EMAIL_TOKEN)
    for link in (_root(link) for link in pii.links):
        add_value(_link_key(link), LINK)
        username = _username(link)
        if username:
            add_value(username, LINK)
    add_value(_root(pii.address), ADDRESS)
    add_value(_root(pii.hometown), HOMETOWN)
    add_value(_root(pii.religion), RELIGION)
    dob = _root(pii.date_of_birth)
    if dob:
        add_value(dob, DOB)
        found.extend(_date_patterns(dob))
    return found


def _folded(pattern: str, token: str) -> _Pattern:
    return _Pattern(re.compile(rf"(?<!\w){pattern}(?!\w)"), token, on_folded=True)


GENERIC = (
    _Pattern(URL, LINK, on_folded=False),
    _Pattern(EMAIL, EMAIL_TOKEN, on_folded=False),
    _Pattern(PHONE, PHONE_TOKEN, on_folded=False),
)


def _date_patterns(dob: str) -> list[_Pattern]:
    """The date of birth in the usual Vietnamese and ISO forms, whatever form the CV used."""
    numbers = re.findall(r"\d+", dob)
    if len(numbers) != 3:
        return []
    if len(numbers[0]) == 4:
        year, month, day = numbers
    else:
        day, month, year = numbers
    if len(year) != 4:
        return []
    d, m = rf"0?{int(day)}", rf"0?{int(month)}"
    sep = r"\s*[/.-]\s*"
    return [
        _folded(rf"{d}{sep}{m}{sep}{year}", DOB),
        _folded(rf"{year}{sep}{m}{sep}{d}", DOB),
        _folded(rf"(?:ngay\s+)?{d}\s+thang\s+{m}\s*,?\s+nam\s+{year}", DOB),
    ]


def _username(link: str) -> str | None:
    path = re.sub(r"^(?:https?://)?[^/]+/?", "", link.strip()).split("?", 1)[0]
    for segment in path.split("/"):
        segment = segment.lstrip("@")
        if segment and segment.lower() not in LINK_PREFIXES:
            return segment if len(segment) >= MIN_LOCAL_PART else None
    return None


def _root(value: Any) -> str:
    """The text of a generated RootModel wrapper, or of a plain string."""
    if value is None:
        return ""
    return str(getattr(value, "root", value))


def _spans(text: str, pii: CvPii) -> list[tuple[int, int, str]]:
    """Every personal value found in `text`, as (start, end, token) in the original text."""
    folded_text, origin = fold(text)
    spans: list[tuple[int, int, str]] = []
    for pattern in (*_patterns(pii), *GENERIC):
        source = folded_text if pattern.on_folded else text
        for match in pattern.regex.finditer(source):
            if match.end() == match.start():
                continue
            if pattern.on_folded:
                start, end = origin[match.start()], origin[match.end() - 1] + 1
            else:
                start, end = match.span()
            spans.append((start, end, pattern.token))
    phones = {phone_key(_root(phone)) for phone in pii.phones}
    for match in DIGIT_RUN.finditer(text):
        if phone_key(match[0]) in phones:
            spans.append((*match.span(), PHONE_TOKEN))
    for match in LABELLED.finditer(folded_text):
        label = match["label"]
        token = next(token for token, labels in LABELS.items() if label in labels)
        value_start = origin[match.start("value")]
        value_end = origin[match.end("value") - 1] + 1
        # Already masked ("Giới tính: [GENDER]"): nothing personal is left on the line.
        if not ONLY_TOKENS.fullmatch(text[value_start:value_end].strip()):
            spans.append((value_start, value_end, token))
    return spans


def mask_text(text: str, pii: CvPii) -> str:
    """`text` with every personal value replaced by its token (AC-6, AC-7). Overlapping finds keep
    the longest, so "nguyenvanan@example.com" is one [EMAIL], not a [NAME] inside one."""
    chosen: list[tuple[int, int, str]] = []
    for start, end, token in sorted(_spans(text, pii), key=lambda s: (s[0] - s[1], s[0])):
        if all(end <= s or start >= e for s, e, _ in chosen):
            chosen.append((start, end, token))
    for start, end, token in sorted(chosen, reverse=True):
        text = text[:start] + token + text[end:]
    return text


def mask_profile(profile: CvProfile, pii: CvPii) -> CvProfile:
    """`profile_masked`: the profile with `mask_text` applied to every string (BR-03)."""
    data = _map_strings(profile.model_dump(mode="json"), lambda text: mask_text(text, pii))
    return CvProfile.model_validate(data)


# --- 5. final check ---------------------------------------------------------------------------


def find_pii(text: str, pii: CvPii) -> list[str]:
    """Tokens of the personal values still in `text`; empty when masking worked."""
    return sorted({token for _, _, token in _spans(text, pii)})


def has_mask_token(text: str) -> bool:
    """`text` had personal data replaced, so it is not passed on as is (US-2.5 new skills)."""
    return MASK_TOKEN.search(text) is not None


def strings_of(value: Any) -> list[str]:
    """Every string in a nested structure of dicts and lists."""
    found: list[str] = []
    _map_strings(value, lambda text: found.append(text) or text)
    return found


def _map_strings(value: Any, change: Callable[[str], str]) -> Any:
    if isinstance(value, str):
        return change(value)
    if isinstance(value, list):
        return [_map_strings(item, change) for item in value]
    if isinstance(value, dict):
        return {key: _map_strings(item, change) for key, item in value.items()}
    return value
