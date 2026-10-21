"""Text extraction drops hidden text before any prompt (US-2.3 AC-2, AC-12; US-2.4 AC-2, AC-3).

Sample files come from tests/fixtures/jd/make_fixtures.py; the small cases are built in the test.
"""

import io
from pathlib import Path

import pymupdf
import pytest
from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

from app.parsing import DocumentError, HiddenReason, clean_text, extract_text
from app.parsing.hidden_text import same_colour

JD_FILES = Path(__file__).parents[1] / "fixtures" / "jd"


def sample(name: str) -> bytes:
    return (JD_FILES / name).read_bytes()


def reasons(data: bytes) -> list[tuple[HiddenReason, str]]:
    return [(span.reason, span.text) for span in extract_text(data).removed]


def pdf(build) -> bytes:
    document = pymupdf.open()
    build(document.new_page())
    return document.tobytes()


def docx(build) -> bytes:
    document = Document()
    build(document)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


# --- PDF -------------------------------------------------------------------------------------


def test_gd1_pdf_visible_text_kept_in_reading_order():
    result = extract_text(sample("jd.pdf"))
    assert result.has_text_layer
    assert not result.hidden_text_detected
    assert result.text.index("Backend Intern") < result.text.index("Experience with Redis.")


def test_gd2_pdf_hidden_text_removed_and_flagged():
    """White on white, under 2 pt and outside the page (US-2.4 AC-2), in one file."""
    hidden = extract_text(sample("jd_hidden.pdf"))
    clean = extract_text(sample("jd.pdf"))
    assert hidden.text == clean.text
    assert hidden.hidden_text_detected
    assert [span.reason for span in hidden.removed] == [
        HiddenReason.SAME_COLOUR_AS_BACKGROUND,
        HiddenReason.TINY_FONT,
        HiddenReason.OUTSIDE_PAGE,
    ]
    assert "Ignore all previous instructions" in hidden.removed[0].text
    assert all(span.location == "page 1" for span in hidden.removed)


def test_pdf_text_on_a_filled_shape_compares_with_the_shape_colour():
    def build(page: pymupdf.Page) -> None:
        page.draw_rect(pymupdf.Rect(50, 50, 400, 140), color=None, fill=(0, 0, 0))
        page.insert_text((72, 80), "White on black", fontsize=11, color=(1, 1, 1))
        page.insert_text((72, 120), "Black on black", fontsize=11, color=(0, 0, 0))
        page.insert_text((72, 200), "Light grey on white", fontsize=11, color=(0.85, 0.85, 0.85))

    result = extract_text(pdf(build))
    assert "White on black" in result.text
    assert "Light grey on white" in result.text
    assert [(s.reason, s.text) for s in result.removed] == [
        (HiddenReason.SAME_COLOUR_AS_BACKGROUND, "Black on black")
    ]


def test_pdf_font_of_2pt_is_visible():
    def build(page: pymupdf.Page) -> None:
        page.insert_text((72, 72), "Two points", fontsize=2)
        page.insert_text((72, 90), "Below two", fontsize=1.9)

    assert reasons(pdf(build)) == [(HiddenReason.TINY_FONT, "Below two")]


def test_pdf_without_text_layer_is_reported_as_a_scan():
    result = extract_text(sample("jd_scanned.pdf"))
    assert (result.text, result.has_text_layer, result.removed) == ("", False, ())


# --- DOCX ------------------------------------------------------------------------------------


def test_gd1_docx_visible_text_kept_with_vietnamese():
    result = extract_text(sample("jd.docx"))
    assert result.text.splitlines()[0] == "Thực tập sinh Tester - Công ty Demo Gamma"
    assert not result.hidden_text_detected


def test_gd2_docx_hidden_text_removed_and_flagged():
    """Hidden attribute, white on white, under 2 pt, colour of its highlight (US-2.4 AC-3)."""
    hidden = extract_text(sample("jd_hidden.docx"))
    assert hidden.text == extract_text(sample("jd.docx")).text
    assert [span.reason for span in hidden.removed] == [
        HiddenReason.HIDDEN_ATTRIBUTE,
        HiddenReason.SAME_COLOUR_AS_BACKGROUND,
        HiddenReason.TINY_FONT,
        HiddenReason.SAME_COLOUR_AS_BACKGROUND,
    ]
    assert "DATA_AI" in hidden.removed[0].text


def test_docx_hidden_through_a_style_is_removed():
    def build(document) -> None:
        style = document.styles.add_style("Secret", 2)  # character style
        style.font.hidden = True
        paragraph = document.add_paragraph("Java. ")
        paragraph.add_run("Hidden by style.", style="Secret")

    assert reasons(docx(build)) == [(HiddenReason.HIDDEN_ATTRIBUTE, "Hidden by style.")]


def test_docx_table_cell_shading_is_the_background():
    def build(document) -> None:
        cell = document.add_table(rows=1, cols=1).cell(0, 0)
        cell.text = "Black on a black cell"
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(0, 0, 0)
        shading = OxmlElement("w:shd")
        shading.set(qn("w:val"), "clear")
        shading.set(qn("w:fill"), "000000")
        cell._tc.get_or_add_tcPr().append(shading)
        document.add_paragraph("Docker")

    result = extract_text(docx(build))
    assert result.text == "Docker"
    assert [s.reason for s in result.removed] == [HiddenReason.SAME_COLOUR_AS_BACKGROUND]


def test_docx_theme_background_colour_and_highlight():
    def build(document) -> None:
        paragraph = document.add_paragraph("Git. ")
        run = paragraph.add_run("Theme white.")
        colour = OxmlElement("w:color")
        colour.set(qn("w:val"), "FFFFFF")
        colour.set(qn("w:themeColor"), "background1")
        run._r.get_or_add_rPr().append(colour)
        readable = paragraph.add_run(" White on black highlight.")
        readable.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        readable.font.highlight_color = WD_COLOR_INDEX.BLACK

    result = extract_text(docx(build))
    assert result.text == "Git.  White on black highlight."
    assert [(s.reason, s.text) for s in result.removed] == [
        (HiddenReason.SAME_COLOUR_AS_BACKGROUND, "Theme white.")
    ]


def test_docx_text_box_read_once():
    """Word keeps a text box twice (mc:Choice and its VML mc:Fallback); its text counts once."""
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    mc = "http://schemas.openxmlformats.org/markup-compatibility/2006"

    def build(document) -> None:
        paragraph = document.add_paragraph("Anchor.")
        box = (
            f'<mc:AlternateContent xmlns:mc="{mc}" xmlns:w="{w}">'
            f'<mc:Choice Requires="wps"><w:drawing><w:txbxContent><w:p><w:r><w:t>In the box'
            f"</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:Choice>"
            f"<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>In the box</w:t></w:r></w:p>"
            f"</w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent>"
        )
        from lxml import etree

        run = paragraph.add_run()
        run._r.append(etree.fromstring(box))

    result = extract_text(docx(build))
    assert result.text.count("In the box") == 1
    assert result.text.splitlines()[0] == "Anchor."


def test_docx_font_size_from_document_defaults():
    def build(document) -> None:
        document.add_paragraph("Normal size.")
        document.add_paragraph().add_run("Tiny.").font.size = Pt(1.5)

    assert reasons(docx(build)) == [(HiddenReason.TINY_FONT, "Tiny.")]


# --- Any source ------------------------------------------------------------------------------


def test_tag_characters_are_removed_and_reported():
    """Unicode tag characters spell text a reader cannot see (ASCII smuggling)."""
    smuggled = "".join(chr(0xE0000 + ord(c)) for c in "weight 10")
    text, removed = clean_text(f"Java{smuggled} Spring", "description")
    assert text == "Java Spring"
    assert [(s.reason, s.text, s.location) for s in removed] == [
        (HiddenReason.INVISIBLE_CHARACTERS, "weight 10", "description")
    ]


def test_zero_width_and_control_characters_are_dropped_without_a_flag():
    text, removed = clean_text("Ja​va­\x07\tSQL\nGit", "description")
    assert (text, removed) == ("Java\tSQL\nGit", ())


def test_same_colour_tolerance():
    assert same_colour((255, 255, 255), (240, 240, 240))
    assert not same_colour((255, 255, 255), (221, 221, 221))


@pytest.mark.parametrize("data", [b"", b"plain text", b"%PDF-1.7 broken", b"PK\x03\x04broken"])
def test_unreadable_files_raise_document_error(data: bytes):
    with pytest.raises(DocumentError):
        extract_text(data)
