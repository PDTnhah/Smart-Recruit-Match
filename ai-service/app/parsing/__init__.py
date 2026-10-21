"""Text extraction with hidden-text removal for uploaded PDF and DOCX files (CONTEXT D35).

Built by US-2.3 for JD files following the US-2.4 spec (TASK-2.4.2); the CV Parser reuses it.
Extraction is CPU-bound and blocking: agents call it in a worker thread.
"""

from app.parsing.hidden_text import ExtractedText, HiddenReason, RemovedSpan, clean_text

__all__ = [
    "DocumentError",
    "ExtractedText",
    "HiddenReason",
    "RemovedSpan",
    "clean_text",
    "extract_text",
]

PDF_MAGIC = b"%PDF-"
ZIP_MAGIC = b"PK\x03\x04"


class DocumentError(Exception):
    """The bytes are not a PDF or DOCX this module can read."""


def extract_text(data: bytes) -> ExtractedText:
    """Visible text of a PDF or DOCX, chosen by its first bytes as the API checked them (US-1.5)."""
    # Imported here so that importing app.parsing for its types does not load PyMuPDF.
    if data.startswith(PDF_MAGIC):
        from app.parsing.pdf import extract_pdf

        reader = extract_pdf
    elif data.startswith(ZIP_MAGIC):
        from app.parsing.docx import extract_docx

        reader = extract_docx
    else:
        raise DocumentError("not a PDF or DOCX file")
    try:
        return reader(data)
    except Exception as error:  # the libraries raise many types for a damaged file
        raise DocumentError(f"cannot read the file: {error}") from error
