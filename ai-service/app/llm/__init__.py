"""The only place the AI Service calls an LLM (AD-10, CONTEXT D34).

Agents depend on `LLMClient` (client.py) and never import a provider SDK; `google.genai` and
`anthropic` are imported only inside app/llm (AC-12).
"""
