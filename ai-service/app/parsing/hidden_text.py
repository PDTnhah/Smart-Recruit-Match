"""What text extraction returns, shared by the JD Analyzer and the CV Parser (CONTEXT D35).

Hidden text is the main prompt-injection channel in an uploaded file (PRD › Kiểm soát rủi ro AI): a
line in white on white, in a 1 pt font, outside the page or marked hidden can tell the LLM to
"ignore the instructions". Extraction drops such spans before anything reaches a prompt, keeps what
it dropped for the job log, and raises the flag that staff see (AGENTS › Invariant 6).
"""

import unicodedata
from dataclasses import dataclass
from enum import StrEnum

MIN_VISIBLE_FONT_SIZE = 2.0
"""Points. Smaller text is unreadable on paper and on screen (US-2.4 AC-2, AC-3)."""

COLOUR_TOLERANCE = 24
"""Largest per-channel difference (0-255) between text and background still read as "the same
colour". Light grey on white (#DDDDDD) stays visible; #F0F0F0 on white does not."""

RGB = tuple[int, int, int]
WHITE: RGB = (255, 255, 255)

# Unicode tag characters (U+E0000-U+E007F) spell ASCII that a reader cannot see but an LLM reads
# ("ASCII smuggling"); text from any source is cleaned of them.
TAG_CHARACTERS = range(0xE0000, 0xE0080)


class HiddenReason(StrEnum):
    SAME_COLOUR_AS_BACKGROUND = "SAME_COLOUR_AS_BACKGROUND"
    TINY_FONT = "TINY_FONT"
    OUTSIDE_PAGE = "OUTSIDE_PAGE"
    HIDDEN_ATTRIBUTE = "HIDDEN_ATTRIBUTE"
    COVERED = "COVERED"
    """An opaque shape is painted over the text after it."""
    INVISIBLE_CHARACTERS = "INVISIBLE_CHARACTERS"


@dataclass(frozen=True)
class RemovedSpan:
    text: str
    reason: HiddenReason
    location: str
    """Where it was, for staff: "page 2", "paragraph 14"."""


@dataclass(frozen=True)
class ExtractedText:
    text: str
    """Visible text only, in reading order; this is what may go into a prompt."""
    removed: tuple[RemovedSpan, ...]
    has_text_layer: bool
    """False for a PDF without text (a scan); its text is then empty."""
    has_images: bool = False
    """The file embeds at least one image: a photo, a logo, or the page of a scan (US-2.4)."""

    @property
    def hidden_text_detected(self) -> bool:
        return bool(self.removed)


def same_colour(a: RGB, b: RGB) -> bool:
    return all(abs(x - y) <= COLOUR_TOLERANCE for x, y in zip(a, b, strict=True))


def clean_text(text: str, location: str) -> tuple[str, tuple[RemovedSpan, ...]]:
    """NFC-normalised text without format and control characters (zero-width spaces, bidi marks,
    tag characters), keeping line breaks and tabs. Tag characters are reported as hidden text;
    the other format characters occur in ordinary text (emoji joiners, soft hyphens) and are not.
    """
    kept: list[str] = []
    smuggled: list[str] = []
    for char in unicodedata.normalize("NFC", text):
        if ord(char) in TAG_CHARACTERS:
            # U+E0020-U+E007E mirror printable ASCII; the language and cancel tags carry no text.
            if 0xE0020 <= ord(char) <= 0xE007E:
                smuggled.append(chr(ord(char) - 0xE0000))
        elif char in "\n\t" or unicodedata.category(char) not in ("Cf", "Cc", "Co", "Cs"):
            kept.append(char)
    removed = ()
    if smuggled:
        removed = (RemovedSpan("".join(smuggled), HiddenReason.INVISIBLE_CHARACTERS, location),)
    return "".join(kept), removed


def join_blocks(blocks: list[str]) -> str:
    """Blocks separated by one blank line, each with trailing spaces trimmed."""
    lines = "\n\n".join(block.strip() for block in blocks if block.strip())
    return "\n".join(line.rstrip() for line in lines.splitlines())
