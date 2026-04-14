# Appendix E — AI / Agent / Extraction Logic

**Parent document:** `docs/blueprint/00-blueprint.md`
**Status:** Volatile — AI capabilities are layered in Module 6-7. This appendix defines the target design.

---

## E.1 AI Extraction Objectives

The AI extraction service supports **realistic contract administration**, not generic summarization. It must:

- Extract structured clauses and BOQ data from native/scanned PDFs
- Preserve page and section references
- Classify clause types
- Detect payment / notice / variation / claim / scope language
- Analyze received letters against contract context
- Generate internal draft reply suggestions with supporting clauses

---

## E.2 Extraction Pipeline

| Stage | Description |
|---|---|
| 1. Document Intake | Upload PDF, detect native vs scanned, run OCR if needed |
| 2. Structural Parsing | Identify headings, numbering, tables, appendices |
| 3. Clause Segmentation | Split by numbered clause logic and heading patterns |
| 4. BOQ Table Detection | Detect schedule/table regions and parse rows |
| 5. Classification | Classify clauses by category |
| 6. Normalization | Map extracted values to canonical schema |
| 7. Human Review Queue | Reviewer confirms or corrects extraction |
| 8. Approved Knowledge Store | Approved clauses and BOQ items become searchable |
| 9. Contextual Assistance | Letter analysis and drafting tools query approved knowledge only |

---

## E.3 Required AI Output Fields

### Clause Extraction
- clause_reference
- clause_heading
- clause_text
- clause_category
- page_number
- section_path
- extraction_confidence
- related_keywords
- approval_required_flag

### BOQ Extraction
- boq_reference
- item_number
- description
- unit, quantity, rate, amount
- page_number
- extraction_confidence
- possible_package_mapping
- possible_cost_code_mapping
- possible_subcontract_scope_mapping

---

## E.4 Received Letter Analysis

### Inputs
- Received letter text
- Linked project contract
- Linked amendments
- Prior correspondence (if selected)

### Outputs
- Concise issue summary
- Potential contractual risk areas
- Potentially relevant clauses
- Suggested reply points
- Suggested notice urgency level
- Missing-information warning (if confidence low)

---

## E.5 Drafting Guardrails

The AI service must NOT:
- Auto-send correspondence
- Auto-approve claims or notices
- Create final legal positions without human review
- Use unapproved extracted clauses as authoritative support

---

## E.6 Confidence and Validation Rules

| Condition | Action |
|---|---|
| Below-threshold OCR confidence | Mandatory manual review |
| Low clause classification confidence | Mark as advisory only |
| BOQ table ambiguity | Send to review queue |
| No source traceability | Output not eligible for approved knowledge store |

---

## E.7 Agent Architecture

### Agents

| Agent | Responsibilities |
|---|---|
| **Intake Agent** | Receives files, classifies document type, routes to engine, checks metadata |
| **Document Extraction Agent** | OCR, structured field extraction, low-confidence flagging, draft records |
| **Contract Intelligence Agent** | Clause/BOQ extraction, clause-notice linking, contract-aware drafting |
| **Commercial Preparation Agent** | IPA/IPC/VO/tax invoice drafts, BOQ/clause support linking |
| **Procurement Preparation Agent** | RFQ comparisons, invoice/expense entries, budget/vendor consistency |
| **Validation Agent** | Pre-submission/posting rule checks, duplicates, thresholds, mappings |
| **KPI/Reporting Agent** | KPI snapshots, event completeness, anomaly flags |
| **Admin Support Agent** | Config review, workflow change previews, reference data correction under override |

### Agent Guardrails

Every agent action must:
1. Run under a defined service account or scoped permission token
2. Log who initiated it and why
3. Record source documents used
4. Store confidence score where extraction/interpretation is involved
5. Require human verification when below threshold or when policy says so
6. Never override approval authority matrix

### Agent Access Roles

| Role | Scope |
|---|---|
| agent_intake_role | File classification and routing |
| agent_extraction_role | OCR and structured parsing |
| agent_validation_role | Rule checking before submission/posting |
| agent_reporting_role | KPI and reporting data preparation |
| admin_support_role | Configuration assistance under admin oversight |

Each role limited to explicit actions and logs. No unrestricted hidden superuser access unless Master Admin intentionally grants for a specific controlled task.

---

## E.8 Verification Marking Logic

When AI processes documents or enters data, records carry explicit verification status:

| Status | Meaning |
|---|---|
| Verified by Source Match | AI output matches source document with high confidence |
| Pending Human Verification | Output needs human review before use |
| Low Confidence Extraction | Below confidence threshold |
| Incomplete Source Data | Source document missing expected fields |
| Ambiguous Mapping | Multiple possible interpretations |
| Requires Commercial Review | Needs commercial team judgment |
| Requires Finance Review | Needs finance team judgment |
| Requires Contract Review | Needs contracts team judgment |

If any field is blurry, unreadable, inconsistent, or uncertain:
- Highlight the field
- Attach confidence score
- Prevent silent posting
- Require user confirmation before final use where critical
