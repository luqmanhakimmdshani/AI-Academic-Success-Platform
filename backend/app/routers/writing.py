import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Draft, User, WritingFeedback
from app.schemas import WritingFeedbackOut, WritingFeedbackRequest, WritingHistoryItemOut
from app.services.writing_service import get_writing_feedback

router = APIRouter(prefix="/api/writing", tags=["writing"])


@router.get("/history", response_model=list[WritingHistoryItemOut])
def list_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    drafts = (
        db.query(Draft)
        .filter(Draft.user_id == current_user.id)
        .order_by(Draft.submitted_at.desc())
        .all()
    )
    return [
        WritingHistoryItemOut(
            draft_id=d.id, preview=d.content[:80], language=d.language, submitted_at=d.submitted_at
        )
        for d in drafts
        if d.feedback
    ]


@router.get("/feedback/{draft_id}", response_model=WritingFeedbackOut)
def get_feedback(draft_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    draft = db.get(Draft, draft_id)
    if draft is None or draft.user_id != current_user.id or draft.feedback is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft not found")
    return WritingFeedbackOut(
        draft_id=draft.id,
        clarity_notes=draft.feedback.clarity_notes,
        citation_gaps=draft.feedback.citation_gaps,
        grammar_notes=draft.feedback.grammar_notes,
        suggestions=draft.feedback.suggestions,
    )


@router.post("/feedback", response_model=WritingFeedbackOut)
def feedback(
    payload: WritingFeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = Draft(user_id=current_user.id, content=payload.content, language=payload.language)
    db.add(draft)
    db.flush()

    result = get_writing_feedback(payload.content, payload.language)

    writing_feedback = WritingFeedback(
        draft_id=draft.id,
        clarity_notes=result["clarity_notes"],
        citation_gaps=result["citation_gaps"],
        grammar_notes=result["grammar_notes"],
        suggestions=result["suggestions"],
    )
    db.add(writing_feedback)
    db.commit()

    return WritingFeedbackOut(
        draft_id=draft.id,
        clarity_notes=result["clarity_notes"],
        citation_gaps=result["citation_gaps"],
        grammar_notes=result["grammar_notes"],
        suggestions=result["suggestions"],
    )
