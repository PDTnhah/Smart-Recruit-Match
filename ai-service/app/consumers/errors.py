"""How a handler tells the job runner whether another attempt can help (NFR-10)."""


class RetryableError(Exception):
    """A failure that may pass on a later attempt: network, timeout, rate limit, overload.

    Any exception that is not a PermanentError is treated the same way.
    """


class PermanentError(Exception):
    """Retrying cannot help: the LLM refused, output stays invalid after US-2.2's own retries,
    or the input is unusable. The job fails at once and staff must look at the item (AC-7)."""

    def __init__(self, message: str, *, code: str = "PERMANENT_ERROR") -> None:
        super().__init__(message)
        self.code = code


class NeedsHumanReview(PermanentError):
    """The LLM refused, or its output stayed invalid after LLMClient's retries (US-2.2 AC-3, AC-4).

    `category` is the provider's refusal category when it gave one, e.g. Claude's
    `stop_details.category` or Gemini's finish reason.
    """

    def __init__(self, message: str, *, code: str, category: str | None = None) -> None:
        super().__init__(message, code=code)
        self.category = category
