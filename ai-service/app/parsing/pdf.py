"""Visible text of a PDF, span by span (US-2.4 TASK-2.4.2, US-2.3 AC-2, AC-12).

PyMuPDF gives each text span its colour, size, opacity and box, and the page's painting order
(`get_bboxlog`, whose positions are the `seqno` of `get_drawings`). A span is hidden when its centre
is outside the visible page, its font is under 2 pt, it is fully transparent, an opaque shape is
painted over it afterwards, or it has the colour of what was painted under it before (the last
filled shape under its centre, else the white page). Under an image or a gradient the background
is unknown, so the colour test is skipped there: white text on a dark banner image stays.
Text outside the page is read on purpose (PyMuPDF clips it away by default), so it can be flagged.
"""

from dataclasses import dataclass

import pymupdf

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

TEXT_FLAGS = pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_MEDIABOX_CLIP
MIN_FILL_OPACITY = 0.5
"""A shape more transparent than this does not hide the text drawn in its colour."""
COVER_OPACITY = 0.9
"""A shape painted over text hides it only when nearly opaque; watermarks are lighter."""
LAST = float("inf")
"""Painting position of a span not found in the log: drawn after everything."""


@dataclass(frozen=True)
class _Layer:
    """Something painted on the page that text can sit on or under."""

    order: int
    rect: pymupdf.Rect
    colour: RGB | None
    """None for an image or a gradient: its colour under a given point is not known."""
    opaque: bool


@dataclass(frozen=True)
class _Paint:
    texts: list[tuple[int, pymupdf.Rect]]
    layers: list[_Layer]

    def order_of(self, centre: pymupdf.Point) -> float:
        """Painting position of the first text drawing that holds this point."""
        for order, rect in self.texts:
            if rect.contains(centre):
                return order
        return LAST

    def background(self, centre: pymupdf.Point, order: float) -> RGB | None:
        for layer in reversed(self.layers):
            if layer.order < order and layer.rect.contains(centre):
                return layer.colour
        return WHITE

    def covered(self, centre: pymupdf.Point, order: float) -> bool:
        return any(
            layer.order > order and layer.opaque and layer.rect.contains(centre)
            for layer in self.layers
        )


def extract_pdf(data: bytes) -> ExtractedText:
    with pymupdf.open(stream=data, filetype="pdf") as document:
        pages: list[str] = []
        removed: list[RemovedSpan] = []
        has_text = False
        has_images = False
        for number, page in enumerate(document, start=1):
            text, page_removed, page_has_text = _read_page(page, f"page {number}")
            pages.append(text)
            removed.extend(page_removed)
            has_text = has_text or page_has_text
            has_images = has_images or bool(page.get_images())
    return ExtractedText(
        text=join_blocks(pages),
        removed=tuple(removed),
        has_text_layer=has_text,
        has_images=has_images,
    )


def _read_page(page: pymupdf.Page, location: str) -> tuple[str, list[RemovedSpan], bool]:
    paint = _paint(page)
    blocks: list[str] = []
    removed: list[RemovedSpan] = []
    has_text = False
    # Without an unbounded clip, PyMuPDF drops text outside the page before we can flag it.
    content = page.get_text("dict", flags=TEXT_FLAGS, clip=pymupdf.INFINITE_RECT())
    for block in content["blocks"]:
        if block.get("type") != 0:
            continue
        lines: list[str] = []
        for line in block["lines"]:
            visible: list[str] = []
            for span in line["spans"]:
                text = span["text"]
                if not text.strip():
                    visible.append(text)
                    continue
                has_text = True
                reason = _hidden_reason(page, span, paint)
                if reason is None:
                    visible.append(text)
                else:
                    removed.append(RemovedSpan(text.strip(), reason, location))
            lines.append("".join(visible))
        blocks.append("\n".join(lines))
    text, smuggled = clean_text(join_blocks(blocks), location)
    removed.extend(smuggled)
    return text, removed, has_text


def _hidden_reason(page: pymupdf.Page, span: dict, paint: _Paint) -> HiddenReason | None:
    box = pymupdf.Rect(span["bbox"])
    centre = pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
    if not page.rect.contains(centre):
        return HiddenReason.OUTSIDE_PAGE
    if span["size"] < MIN_VISIBLE_FONT_SIZE:
        return HiddenReason.TINY_FONT
    if span.get("alpha", 255) == 0:
        return HiddenReason.HIDDEN_ATTRIBUTE
    order = paint.order_of(centre)
    if paint.covered(centre, order):
        return HiddenReason.COVERED
    background = paint.background(centre, order)
    if background is not None and same_colour(_rgb(span["color"]), background):
        return HiddenReason.SAME_COLOUR_AS_BACKGROUND
    return None


def _paint(page: pymupdf.Page) -> _Paint:
    """Text drawings and the shapes and images around them, in painting order."""
    drawings = {drawing["seqno"]: drawing for drawing in page.get_drawings()}
    texts: list[tuple[int, pymupdf.Rect]] = []
    layers: list[_Layer] = []
    for order, (kind, bbox) in enumerate(page.get_bboxlog()):
        rect = pymupdf.Rect(bbox)
        if kind.endswith("-text"):
            texts.append((order, rect))
        elif kind in ("fill-image", "fill-shade"):
            layers.append(_Layer(order, rect, None, opaque=False))
        elif kind == "fill-path":
            drawing = drawings.get(order)
            colour = drawing.get("fill") if drawing else None
            opacity = drawing.get("fill_opacity") if drawing else None
            opacity = 1.0 if opacity is None else opacity
            if colour is None or opacity < MIN_FILL_OPACITY:
                continue
            layers.append(_Layer(order, rect, _rgb_floats(colour), opaque=opacity >= COVER_OPACITY))
    return _Paint(texts, layers)


def _rgb(colour: int) -> RGB:
    return ((colour >> 16) & 0xFF, (colour >> 8) & 0xFF, colour & 0xFF)


def _rgb_floats(colour: tuple[float, ...]) -> RGB:
    if len(colour) == 1:  # grey
        grey = round(colour[0] * 255)
        return (grey, grey, grey)
    if len(colour) == 4:  # CMYK, approximated
        c, m, y, k = colour
        return tuple(round(255 * (1 - x) * (1 - k)) for x in (c, m, y))  # type: ignore[return-value]
    r, g, b = colour[:3]
    return (round(r * 255), round(g * 255), round(b * 255))
