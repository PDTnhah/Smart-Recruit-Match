"""Visible text of a PDF, span by span (US-2.4 TASK-2.4.2, US-2.3 AC-2, AC-12).

PyMuPDF gives each text span its colour, size, opacity and box. A span is hidden when it is drawn
in the colour of what lies under it (the last filled shape under its centre, else the white page),
in a font under 2 pt, fully transparent, or with its centre outside the visible page. Text outside
the page is read on purpose (PyMuPDF clips it away by default), so it can be flagged.
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


@dataclass(frozen=True)
class _Fill:
    rect: pymupdf.Rect
    colour: RGB


def extract_pdf(data: bytes) -> ExtractedText:
    with pymupdf.open(stream=data, filetype="pdf") as document:
        pages: list[str] = []
        removed: list[RemovedSpan] = []
        has_text = False
        for number, page in enumerate(document, start=1):
            text, page_removed, page_has_text = _read_page(page, f"page {number}")
            pages.append(text)
            removed.extend(page_removed)
            has_text = has_text or page_has_text
    return ExtractedText(text=join_blocks(pages), removed=tuple(removed), has_text_layer=has_text)


def _read_page(page: pymupdf.Page, location: str) -> tuple[str, list[RemovedSpan], bool]:
    fills = _fills(page)
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
                reason = _hidden_reason(page, span, fills)
                if reason is None:
                    visible.append(text)
                else:
                    removed.append(RemovedSpan(text.strip(), reason, location))
            lines.append("".join(visible))
        blocks.append("\n".join(lines))
    text, smuggled = clean_text(join_blocks(blocks), location)
    removed.extend(smuggled)
    return text, removed, has_text


def _hidden_reason(page: pymupdf.Page, span: dict, fills: list[_Fill]) -> HiddenReason | None:
    box = pymupdf.Rect(span["bbox"])
    centre = pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
    if not page.rect.contains(centre):
        return HiddenReason.OUTSIDE_PAGE
    if span["size"] < MIN_VISIBLE_FONT_SIZE:
        return HiddenReason.TINY_FONT
    if span.get("alpha", 255) == 0:
        return HiddenReason.HIDDEN_ATTRIBUTE
    if same_colour(_rgb(span["color"]), _background(centre, fills)):
        return HiddenReason.SAME_COLOUR_AS_BACKGROUND
    return None


def _fills(page: pymupdf.Page) -> list[_Fill]:
    """Opaque filled shapes in painting order: a later one covers an earlier one."""
    fills = []
    for drawing in page.get_drawings():
        colour = drawing.get("fill")
        opacity = drawing.get("fill_opacity")
        if colour is None or (opacity is not None and opacity < MIN_FILL_OPACITY):
            continue
        fills.append(_Fill(pymupdf.Rect(drawing["rect"]), _rgb_floats(colour)))
    return fills


def _background(point: pymupdf.Point, fills: list[_Fill]) -> RGB:
    for fill in reversed(fills):
        if fill.rect.contains(point):
            return fill.colour
    return WHITE


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
