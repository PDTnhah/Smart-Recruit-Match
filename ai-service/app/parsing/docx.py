"""Visible text of a DOCX, run by run (US-2.4 TASK-2.4.2, US-2.3 AC-2, AC-12).

Paragraphs are read in document order, including those in tables and text boxes. A run is hidden
when it is marked hidden (`w:vanish`), set under 2 pt, or coloured like what lies under it: its own
shading or highlight, else the paragraph's, else the table cell's, else the page colour (white by
default). Formatting is resolved as Word does: the run, then its character style, then the
paragraph style (each with its base styles), then the document defaults. Theme colours are read
as light (background1, light1) or dark (text1, dark1); other theme colours count as visible.
"""

import io
from collections.abc import Iterator

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.ns import qn
from lxml.etree import _Element

from app.parsing.hidden_text import (
    MIN_VISIBLE_FONT_SIZE,
    RGB,
    WHITE,
    ExtractedText,
    HiddenReason,
    RemovedSpan,
    clean_text,
    join_blocks,
    same_colour,
)

BLACK: RGB = (0, 0, 0)
THEME_COLOURS: dict[str, RGB] = {
    "background1": WHITE,
    "light1": WHITE,
    "text1": BLACK,
    "dark1": BLACK,
}
HIGHLIGHT_COLOURS: dict[str, RGB] = {
    "white": WHITE,
    "black": BLACK,
    "yellow": (255, 255, 0),
    "green": (0, 255, 0),
    "cyan": (0, 255, 255),
    "magenta": (255, 0, 255),
    "blue": (0, 0, 255),
    "red": (255, 0, 0),
    "darkBlue": (0, 0, 128),
    "darkCyan": (0, 128, 128),
    "darkGreen": (0, 128, 0),
    "darkMagenta": (128, 0, 128),
    "darkRed": (128, 0, 0),
    "darkYellow": (128, 128, 0),
    "darkGray": (128, 128, 128),
    "lightGray": (192, 192, 192),
}
FALSE_VALUES = frozenset({"0", "false", "off"})
# Word stores a text box twice: as DrawingML (mc:Choice) and as VML for old readers (mc:Fallback).
MC_FALLBACK = "{http://schemas.openxmlformats.org/markup-compatibility/2006}Fallback"


def extract_docx(data: bytes) -> ExtractedText:
    return _Reader(Document(io.BytesIO(data))).read()


class _Reader:
    def __init__(self, document: DocumentObject) -> None:
        self._body = document.element.body
        styles = document.styles.element
        self._styles = {s.get(qn("w:styleId")): s for s in styles.iter(qn("w:style"))}
        self._default_paragraph_style = next(
            (
                s
                for s in self._styles.values()
                if s.get(qn("w:type")) == "paragraph"
                and s.get(qn("w:default")) in ("1", "true", "on")
            ),
            None,
        )
        self._defaults = styles.find(f"{qn('w:docDefaults')}/{qn('w:rPrDefault')}/{qn('w:rPr')}")
        background = document.element.find(qn("w:background"))
        self._page = (
            _hex(background.get(qn("w:color"))) if background is not None else None
        ) or WHITE

    def read(self) -> ExtractedText:
        paragraphs: list[str] = []
        removed: list[RemovedSpan] = []
        index = 0
        for paragraph in self._body.iter(qn("w:p")):
            if any(a.tag == MC_FALLBACK for a in paragraph.iterancestors()):
                continue
            index += 1
            text, hidden = self._paragraph(paragraph, f"paragraph {index}")
            paragraphs.append(text)
            removed.extend(hidden)
        text, smuggled = clean_text("\n".join(paragraphs), "document")
        return ExtractedText(
            text=join_blocks([text]), removed=(*removed, *smuggled), has_text_layer=True
        )

    def _paragraph(self, paragraph: _Element, location: str) -> tuple[str, list[RemovedSpan]]:
        style = self._paragraph_style(paragraph)
        background = _shading(self._ppr_chain(paragraph, style)) or _cell_shading(paragraph)
        background = background or self._page
        pieces: list[str] = []
        removed: list[RemovedSpan] = []
        for run in _own_runs(paragraph):
            text = _run_text(run)
            if not text:
                continue
            reason = None
            if text.strip():
                reason = _hidden_reason(self._rpr_chain(run, style), background)
            if reason is None:
                pieces.append(text)
            else:
                removed.append(RemovedSpan(text.strip(), reason, location))
        return "".join(pieces), removed

    def _paragraph_style(self, paragraph: _Element) -> _Element | None:
        ref = paragraph.find(f"{qn('w:pPr')}/{qn('w:pStyle')}")
        style = self._styles.get(ref.get(qn("w:val"))) if ref is not None else None
        return style if style is not None else self._default_paragraph_style

    def _style_chain(self, style: _Element | None) -> Iterator[_Element]:
        seen: set[str | None] = set()
        while style is not None and style.get(qn("w:styleId")) not in seen:
            seen.add(style.get(qn("w:styleId")))
            yield style
            based_on = style.find(qn("w:basedOn"))
            style = self._styles.get(based_on.get(qn("w:val"))) if based_on is not None else None

    def _rpr_chain(self, run: _Element, paragraph_style: _Element | None) -> list[_Element]:
        """Run properties from the most specific to the least."""
        chain: list[_Element] = []
        rpr = run.find(qn("w:rPr"))
        if rpr is not None:
            chain.append(rpr)
            ref = rpr.find(qn("w:rStyle"))
            if ref is not None:
                chain.extend(self._properties(self._styles.get(ref.get(qn("w:val"))), "w:rPr"))
        chain.extend(self._properties(paragraph_style, "w:rPr"))
        if self._defaults is not None:
            chain.append(self._defaults)
        return chain

    def _ppr_chain(self, paragraph: _Element, style: _Element | None) -> list[_Element]:
        own = paragraph.find(qn("w:pPr"))
        return ([own] if own is not None else []) + self._properties(style, "w:pPr")

    def _properties(self, style: _Element | None, tag: str) -> list[_Element]:
        return [p for s in self._style_chain(style) if (p := s.find(qn(tag))) is not None]


def _hidden_reason(chain: list[_Element], background: RGB) -> HiddenReason | None:
    vanish = _first(chain, "w:vanish")
    if vanish is not None and _on_attr(vanish.get(qn("w:val"))):
        return HiddenReason.HIDDEN_ATTRIBUTE
    size = _first(chain, "w:sz")
    half_points = _int(size.get(qn("w:val"))) if size is not None else None
    if half_points is not None and half_points / 2 < MIN_VISIBLE_FONT_SIZE:
        return HiddenReason.TINY_FONT
    colour = _colour(_first(chain, "w:color"))
    if colour is not None and same_colour(
        colour, _shading(chain) or _highlight(chain) or background
    ):
        return HiddenReason.SAME_COLOUR_AS_BACKGROUND
    return None


def _own_runs(paragraph: _Element) -> Iterator[_Element]:
    """Runs of this paragraph, including those inside hyperlinks, insertions and fields, but not
    those of a text box anchored in it: that box's paragraphs are read on their own."""
    for run in paragraph.iter(qn("w:r")):
        if next(run.iterancestors(qn("w:p")), None) is paragraph:
            yield run


def _run_text(run: _Element) -> str:
    parts = []
    for child in run:
        if child.tag == qn("w:t"):
            parts.append(child.text or "")
        elif child.tag == qn("w:tab"):
            parts.append("\t")
        elif child.tag in (qn("w:br"), qn("w:cr")):
            parts.append("\n")
    return "".join(parts)


def _first(chain: list[_Element], tag: str) -> _Element | None:
    for properties in chain:
        found = properties.find(qn(tag))
        if found is not None:
            return found
    return None


def _on_attr(value: str | None) -> bool:
    """A Word on/off property: present without a value, or with a value other than false."""
    return value is None or value.lower() not in FALSE_VALUES


def _colour(element: _Element | None) -> RGB | None:
    """The text colour; None for "auto" or an unknown theme colour (read as visible)."""
    if element is None:
        return None
    theme = element.get(qn("w:themeColor"))
    if theme is not None:
        return THEME_COLOURS.get(theme)
    return _hex(element.get(qn("w:val")))


def _shading(chain: list[_Element]) -> RGB | None:
    shading = _first(chain, "w:shd")
    if shading is None:
        return None
    theme = shading.get(qn("w:themeFill"))
    if theme is not None:
        return THEME_COLOURS.get(theme)
    return _hex(shading.get(qn("w:fill")))


def _highlight(chain: list[_Element]) -> RGB | None:
    highlight = _first(chain, "w:highlight")
    return None if highlight is None else HIGHLIGHT_COLOURS.get(highlight.get(qn("w:val"), ""))


def _cell_shading(paragraph: _Element) -> RGB | None:
    cell = next(paragraph.iterancestors(qn("w:tc")), None)
    properties = cell.find(qn("w:tcPr")) if cell is not None else None
    return _shading([properties]) if properties is not None else None


def _hex(value: str | None) -> RGB | None:
    if value is None or len(value) != 6:
        return None
    try:
        return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))
    except ValueError:
        return None


def _int(value: str | None) -> int | None:
    try:
        return None if value is None else int(value)
    except ValueError:
        return None
