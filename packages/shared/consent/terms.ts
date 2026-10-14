// Versioned terms for processing a student's personal data (NFR-2, PRD GĐ2 step 1, CONTEXT D30).
// The web shows them and the API records which version, and which exact text, a student accepted.

export interface ConsentTermsSection {
  heading: string;
  paragraphs: readonly string[];
}

export interface ConsentTerms {
  /** Positive and increasing. Never edit a published version: add the next one. */
  version: number;
  title: string;
  sections: readonly ConsentTermsSection[];
}
