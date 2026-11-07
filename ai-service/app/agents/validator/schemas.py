"""What the LLM returns for one Validator call (US-4.2 AC-2, CONTEXT D50).

The model is loose on purpose, like QuestionProposalBatch: code matches each result to its question
by `ref`, and a result it cannot match leaves that one question waiting for the next round instead
of making the LLMClient ask again for the whole call. The LLM reports what it found; `verdict.py`
decides VALIDATED or REJECTED (AD-2). Fields one question type does not use have a fixed value, so
every field stays required.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

OptionLabel = Literal["A", "B", "C", "D"]
DifficultyName = Literal["EASY", "MEDIUM", "HARD"]


class QuestionCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ref: int = Field(description="The ref of the question checked")
    correct_options: list[OptionLabel] = Field(
        description="MCQ: every option that is correct, found by solving the question yourself; "
        "empty when none is. ESSAY: empty"
    )
    on_skill: bool = Field(description="The question tests the skill it names")
    estimated_difficulty: DifficultyName
    answer_leaked: bool = Field(description="The stem or the options give the answer away")
    distractors_plausible: bool = Field(
        description="MCQ: every wrong option is a mistake a student could make. ESSAY: true"
    )
    clear: bool = Field(description="The question has one reading and holds all it needs")
    gradeable_by_criteria: bool = Field(
        description="ESSAY: the criteria can grade any answer to the task. MCQ: true"
    )
    duplicate_of: int | None = Field(
        description="The ref of an earlier question of this request that asks the same, or null"
    )
    note: str = Field(description="One or two sentences on what fails, or an empty string")


class ValidationBatch(BaseModel):
    """Checks of the questions of one request"""

    model_config = ConfigDict(extra="forbid")

    results: list[QuestionCheck]
