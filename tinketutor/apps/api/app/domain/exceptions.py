"""
Domain Exceptions

Custom exceptions for domain-specific error conditions.
These propagate to API error responses via FastAPI exception handlers.
"""


class SynthesisStudioError(Exception):
    """Base exception for all domain errors."""
    def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class NotFoundError(SynthesisStudioError):
    """Resource not found."""
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            message=f"{resource} '{resource_id}' not found",
            code="NOT_FOUND",
        )


class AuthorizationError(SynthesisStudioError):
    """User is not authorized to access this resource."""
    def __init__(self, message: str = "Access denied"):
        super().__init__(message=message, code="FORBIDDEN")


class ValidationError(SynthesisStudioError):
    """Input validation failed."""
    def __init__(self, message: str):
        super().__init__(message=message, code="VALIDATION_ERROR")


class FileTooLargeError(ValidationError):
    """Uploaded file exceeds size limit."""
    def __init__(self, max_size_mb: int = 50):
        super().__init__(message=f"File exceeds maximum size of {max_size_mb} MB")


class UnsupportedFileTypeError(ValidationError):
    """Uploaded file type is not supported."""
    def __init__(self, file_type: str):
        super().__init__(message=f"File type '{file_type}' is not supported. Accepted: PDF, PPTX, DOCX")


class NotebookSourceLimitError(ValidationError):
    """Notebook has reached max number of sources."""
    def __init__(self, max_sources: int = 5):
        super().__init__(message=f"Notebook already has {max_sources} sources (maximum)")


class TutorSessionLimitError(ValidationError):
    """Tutor session has reached max messages."""
    def __init__(self, max_messages: int = 20):
        super().__init__(message=f"Session has reached the maximum of {max_messages} messages")


class InsufficientGroundingError(SynthesisStudioError):
    """Not enough source material to ground the requested operation."""
    def __init__(self):
        super().__init__(
            message="Insufficient source material to answer this query. Upload more documents or rephrase.",
            code="INSUFFICIENT_GROUNDING",
        )


class ProviderError(SynthesisStudioError):
    """Error from an external provider (LLM, parser, storage)."""
    def __init__(self, provider: str, message: str):
        super().__init__(
            message=f"Provider '{provider}' error: {message}",
            code="PROVIDER_ERROR",
        )
