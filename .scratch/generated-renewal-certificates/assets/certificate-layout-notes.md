# Certificate PDF layout proposal

Status: approved
Created: 2026-10-02

Question: What should the issued certificate look like?

Sample: [Certificate layout proposal](../../../output/pdf/certificate-layout-proposal.pdf). Builder: [Disposable layout mockup](./layout_proposal.py). Uses synthetic records, a placeholder for the saved signature/stamp, and the existing company logo. This is a ReportLab visual mockup; it does not implement or validate the accepted production gopdf renderer.

## Approved presentation

- A4 portrait, white background, approximately 14 mm margins, navy/teal accents from the existing branding, and readable body text.
- Smaller company logo at upper left in the header. `CERTIFICATE OF EXAMINATION` is centered below the header, at the top of the certificate body.
- Prominent certificate number and issue/expiry dates immediately below the header. The preview uses `XX`; the issued PDF uses its approved sequence.
- Equipment/component names, serial number, location, and validity period in the equipment/component block. Equipment ID, Component ID, Manufacturer, and Model are omitted from this block. The agreed component display ID remains part of the printed certificate number.
- The sample validity period is `12 months`, corresponding to its issue and expiry dates. Derive the displayed period from the actual approved dates rather than hardcoding one year.
- Test type/description, IMCA references, and IMCA D018 reference in the next block. Issuing authority is not printed.
- Optional remarks and measurements use full-width free text, preserving entered line breaks. Proposed rule: omit an empty optional block instead of printing an empty box.
- Competent-person name, organization, and date beside a proportionally scaled saved signature/stamp image. Competency category is not printed. The competent-person date uses the certificate issue date, as approved. The mockup's placeholder is replaced by the image in production.
- Footer contains `Porto Marine Services L.L.C.`, `www.portomarines.com`, and page numbering. The synthetic-data/proposal label belongs only to the review artifact; it is not production certificate content.

These field removals concern printed presentation, not deletion of existing records, internal identifiers, or competency-based authorization.

## Proposed overflow behavior

Aim for one page for ordinary content, without forcing long remarks into tiny text. Continue long content on further A4 pages, repeating the company header, certificate number, and page numbering. Keep the competent-person/signature block together at the end. The preview/final template remains the same, with the final sequence as the only intended content difference.

Overflow, real signature transparency, complete Unicode coverage, and rendering timing must still be verified in the gopdf investigation/prototype and implementation checks. Only the current one-page mockup has been generated and visually inspected.

## Feedback and verdict

The user approved the revised layout as-is on 2 October 2026. The resolution is recorded in [Validate the branded certificate preview with representative content](../issues/05-review-certificate-preview.md). Reproduce this presentation in gopdf; Unicode, transparency, and long-content pagination remain software verification work, not a claim that the mockup proves production rendering.
