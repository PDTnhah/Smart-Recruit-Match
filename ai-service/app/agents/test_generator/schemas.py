"""What the LLM returns for one round of the Test Generator (US-4.1 AC-7, CONTEXT D49).

The model is loose on purpose: no lengths, counts or "exactly one correct option" here. A question
that breaks a rule is refused alone by `submit_questions`, with its reason, and the rest of the
round is kept; a strict model would make the LLMClient ask again for the whole round. Only the
type and difficulty are enums, which structured output enforces while it decodes. Fields one type
does not use are an empty list or an empty string, so every field stays required.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QuestionTypeName = Literal["MCQ", "ESSAY"]
DifficultyName = Literal["EASY", "MEDIUM", "HARD"]


class ProposedOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    correct: bool


class ProposedCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    criterion: str = Field(description="What the grader looks for")
    max_points: int = Field(description="Points the criterion is worth at most, 1 to 100")


class ProposedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: QuestionTypeName
    skill: str = Field(description="The skill of the cell, as the cell writes it")
    difficulty: DifficultyName
    stem: str
    options: list[ProposedOption] = Field(description="MCQ: 4 options; ESSAY: empty")
    explanation: str
    rubric: list[ProposedCriterion] = Field(description="ESSAY: the criteria; MCQ: empty")
    sample_answer: str = Field(description="ESSAY: a full-marks answer; MCQ: empty")


class QuestionProposalBatch(BaseModel):
    """Draft questions for the cells of one round"""

    model_config = ConfigDict(extra="forbid")

    questions: list[ProposedQuestion]
