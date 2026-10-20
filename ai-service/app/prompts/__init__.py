"""Versioned prompt files `<agent>/v<N>.md` (AD-12, CONTEXT D34).

A released file is never edited: manifest.json pins its hash and a test fails on any change, so a
new wording becomes `v<N+1>`. active.json picks the version each agent uses.
"""
