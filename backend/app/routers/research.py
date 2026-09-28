from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import LitReviewSummary, SearchQuery, User
from app.schemas import LitReviewSummaryOut, ResearchHistoryItemOut, ResearchSearchRequest
from app.services.research_service import run_research_discovery
from app.services.source_service import build_reference_docx

router = APIRouter(prefix="/api/research", tags=["research"])

_DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/history", response_model=list[ResearchHistoryItemOut])
def list_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    queries = (
        db.query(SearchQuery)
        .filter(SearchQuery.user_id == current_user.id)
        .order_by(SearchQuery.created_at.desc())
        .all()
    )
    return [
        ResearchHistoryItemOut(id=q.summary.id, topic=q.topic_text, language=q.language, created_at=q.created_at)
        for q in queries
        if q.summary
    ]


@router.post("/search", response_model=LitReviewSummaryOut)
def search(
    payload: ResearchSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = run_research_discovery(payload.topic, payload.language)

    query = SearchQuery(user_id=current_user.id, topic_text=payload.topic, language=payload.language)
    db.add(query)
    db.flush()

    summary = LitReviewSummary(
        search_query_id=query.id,
        themes=result["themes"],
        key_findings=result["key_findings"],
        research_gaps=result["research_gaps"],
        sources=result["sources"],
        language=payload.language,
    )
    db.add(summary)
    db.commit()
    db.refresh(summary)

    return LitReviewSummaryOut(
        id=summary.id,
        topic=payload.topic,
        language=summary.language,
        themes=summary.themes,
        key_findings=summary.key_findings,
        research_gaps=summary.research_gaps,
        sources=summary.sources,
        created_at=summary.created_at,
    )


@router.get("/search/{summary_id}", response_model=LitReviewSummaryOut)
def get_summary(summary_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    summary = db.get(LitReviewSummary, summary_id)
    if summary is None:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, "Summary not found")
    return LitReviewSummaryOut(
        id=summary.id,
        topic=summary.search_query.topic_text,
        language=summary.language,
        themes=summary.themes,
        key_findings=summary.key_findings,
        research_gaps=summary.research_gaps,
        sources=summary.sources,
        created_at=summary.created_at,
    )


@router.get("/search/{summary_id}/export.docx")
def export_docx(summary_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    summary = db.get(LitReviewSummary, summary_id)
    if summary is None or summary.search_query.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Summary not found")

    citations = [s.get("formatted_apa", "") for s in summary.sources if s.get("formatted_apa")]
    content = build_reference_docx(citations, summary.search_query.topic_text)
    return Response(
        content=content,
        media_type=_DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="references.docx"'},
    )
