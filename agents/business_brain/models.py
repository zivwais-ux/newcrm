"""Structured output of the agents. The app validates these again before storing anything."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

ActionType = Literal["create_task", "prepare_whatsapp", "open_view", "create_flow"]
ViewName = Literal["customers_at_risk", "lapsed_customers", "never_bought", "stuck_deals", "pipeline", "revenue"]
RecipeKey = Literal["win_back", "stuck_deal", "thank_first_purchase", "pending_payment", "won_deal", "new_lead_followup"]


class SuggestedAction(BaseModel):
    """Something the owner can approve with one tap. Nothing runs without approval."""

    type: ActionType
    label: str = Field(description="Button text in Hebrew, 2-5 words, e.g. 'צור משימה לחזור לדנה'")
    customer_id: Optional[str] = Field(default=None, description="Only an id returned by a tool")
    deal_id: Optional[str] = Field(default=None, description="Only an id returned by a tool")
    text: Optional[str] = Field(default=None, description="Task title or WhatsApp message in Hebrew")
    view: Optional[ViewName] = None
    recipe: Optional[RecipeKey] = Field(default=None, description="For create_flow: a ready-made flow")


class Evidence(BaseModel):
    label: str = Field(description="Short Hebrew label, e.g. 'עסקאות תקועות'")
    value: str = Field(description="The number exactly as a tool returned it")


class BlockInsight(BaseModel):
    headline: str = Field(description="One sharp Hebrew sentence, up to 80 characters")
    detail: str = Field(description="Why it matters, in plain Hebrew, up to 2 sentences")
    severity: Literal["info", "opportunity", "warning", "critical"]
    evidence: list[Evidence] = Field(default_factory=list, max_length=4)
    actions: list[SuggestedAction] = Field(default_factory=list, max_length=3)


class AgentReport(BaseModel):
    summary: str = Field(description="One Hebrew sentence: the state of this area right now")
    insights: list[BlockInsight] = Field(default_factory=list, max_length=4)


class Source(BaseModel):
    type: Literal["customer", "deal", "email", "insight", "metric"]
    id: Optional[str] = None
    label: str


class BrainAnswer(BaseModel):
    answer: str = Field(description="The answer in plain Hebrew. Say clearly when the data does not have it.")
    sources: list[Source] = Field(default_factory=list, max_length=8)
    actions: list[SuggestedAction] = Field(default_factory=list, max_length=2)
    confidence: Literal["high", "medium", "low"]
