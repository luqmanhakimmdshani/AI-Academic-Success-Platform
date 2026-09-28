import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# --- Auth ---
class TenantOut(BaseModel):
    id: uuid.UUID
    name: str
    locale_default: str
    logo_url: str | None = None
    logo_scale: int = 100

    class Config:
        from_attributes = True


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    tenant_id: uuid.UUID
    language_pref: str = "en"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    tenant_id: uuid.UUID
    tenant_name: str
    tenant_logo_url: str | None = None
    tenant_logo_scale: int = 100
    language_pref: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Research Discovery ---
class ResearchSearchRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=300)
    language: str = "en"


class SourceOut(BaseModel):
    title: str
    authors: str
    year: int | None = None
    doi: str = ""
    url: str = ""
    venue: str = ""
    formatted_apa: str = ""


class LitReviewSummaryOut(BaseModel):
    id: uuid.UUID
    topic: str
    language: str
    themes: list[dict]
    key_findings: list[dict]
    research_gaps: list[str]
    sources: list[SourceOut]
    created_at: datetime

    class Config:
        from_attributes = True


class ResearchHistoryItemOut(BaseModel):
    id: uuid.UUID
    topic: str
    language: str
    created_at: datetime


# --- Academic Integrity Advisor ---
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    session_id: uuid.UUID | None = None


class ChatMessageOut(BaseModel):
    role: str
    content: str
    cited_policy_chunks: list[dict]
    confidence: str
    language: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    session_id: uuid.UUID
    message: ChatMessageOut


class ChatSessionOut(BaseModel):
    id: uuid.UUID
    started_at: datetime
    preview: str


# --- Writing Support Agent ---
class WritingFeedbackRequest(BaseModel):
    content: str = Field(min_length=20, max_length=4000)
    language: str = "en"


class WritingFeedbackOut(BaseModel):
    draft_id: uuid.UUID
    clarity_notes: list[str]
    citation_gaps: list[str]
    grammar_notes: list[str]
    suggestions: list[str]


class WritingHistoryItemOut(BaseModel):
    draft_id: uuid.UUID
    preview: str
    language: str
    submitted_at: datetime


# --- Source Organiser ---
class SourceOrganiseRequest(BaseModel):
    entries: list[str] = Field(min_length=1, max_length=20)
    language: str = "en"


class ReferenceEntryOut(BaseModel):
    title: str
    authors: str
    year: int | None
    doi: str
    url: str
    credibility_tier: str
    credibility_basis: str
    annotation: str
    formatted_apa: str
    resolved: bool


class ReferenceListOut(BaseModel):
    id: uuid.UUID
    title: str
    entries: list[ReferenceEntryOut]


class ReferenceListHistoryItemOut(BaseModel):
    id: uuid.UUID
    title: str
    entry_count: int
    created_at: datetime


# --- Admin: Policy documents ---
class PolicyDocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    doc_type: str
    version: str
    is_active: bool
    uploaded_at: datetime

    class Config:
        from_attributes = True


class ChatGapOut(BaseModel):
    id: uuid.UUID
    content: str
    language: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Super-admin: Tenants ---
class TenantCreateRequest(BaseModel):
    name: str
    locale_default: str = "en"
    admin_email: EmailStr
    admin_password: str = Field(min_length=8)
