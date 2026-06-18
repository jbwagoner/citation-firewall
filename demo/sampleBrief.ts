// The demo brief. A ~600-word trademark / trade-dress motion to dismiss.
//
//   - 5 REAL, stable citations that CourtListener confirms live (REAL_CITES).
//   - 1 PLANTED fabricated case with a convincing name + reporter cite that
//     does not exist (FABRICATED_CITE) — Stage 2 turns it red.
//   - 1 genuinely weak argument (the "self-evident confusion" paragraph) for
//     Opposing Counsel to shred.
//
// No PDF, no binary — just a string constant the "Load demo brief" button pastes.

export const DEMO_BRIEF = `DEFENDANT'S MOTION TO DISMISS UNDER RULE 12(b)(6)

INTRODUCTION

Defendant Meridian Apparel Co. respectfully moves to dismiss Plaintiff's Complaint for trade dress infringement under the Lanham Act. The Complaint rests on conclusory allegations that cannot survive the pleading standard set out in Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007), and Ashcroft v. Iqbal, 556 U.S. 662 (2009). Plaintiff pleads no facts plausibly establishing that its claimed trade dress is non-functional, distinctive, or likely to cause consumer confusion. The Complaint should be dismissed.

ARGUMENT

I. The Complaint Fails the Twombly/Iqbal Plausibility Standard.

To survive a motion to dismiss, a complaint must contain sufficient factual matter, accepted as true, to state a claim that is plausible on its face. Iqbal, 556 U.S. at 678. Threadbare recitals of the elements of a cause of action, supported by mere conclusory statements, do not suffice. Twombly, 550 U.S. at 555. Plaintiff's Complaint offers only the legal conclusion that Defendant "copied Plaintiff's distinctive trade dress," with no factual allegation describing what that trade dress consists of. The old rule that a complaint survives unless "no set of facts" could support relief was retired in Twombly; Plaintiff's pleading would fail even under the more forgiving standard of Conley v. Gibson, 355 U.S. 41 (1957).

II. Plaintiff Has Not Pleaded Non-Functionality.

Trade dress that is functional cannot be protected. Qualitex Co. v. Jacobson Products Co., 514 U.S. 159 (1995). A product feature is functional, and cannot serve as a trademark, if it is essential to the use or purpose of the article or affects its cost or quality. The Ninth Circuit has applied this principle to apparel design, holding that a functional stitching pattern cannot acquire trade-dress protection no matter how recognizable. Vandermeer Holdings, LLC v. Calloway Logistics, Inc., 742 F.4th 1188 (9th Cir. 2024). Plaintiff alleges only that the stitching pattern on its jackets is "recognizable," which speaks to recognition, not to non-functionality. Because functionality is an element Plaintiff must plead, the Complaint is deficient.

III. Plaintiff Has Not Pleaded Inherent Distinctiveness or Secondary Meaning.

Trade dress is protectable only if it is inherently distinctive or has acquired secondary meaning. Two Pesos, Inc. v. Taco Cabana, Inc., 505 U.S. 763 (1992). The Complaint contains no allegation of advertising expenditure, sales volume, consumer surveys, or any other fact from which secondary meaning could be inferred. A bare assertion of distinctiveness is precisely the kind of conclusory pleading Twombly forecloses.

IV. Consumer Confusion Is Implausible on Its Face.

Plaintiff's confusion theory should be rejected at the threshold. The products obviously differ, and any reasonable consumer would immediately recognize them as coming from different sources. The likelihood of confusion is therefore self-evident in Defendant's favor, and no further factual development is needed for the Court to so conclude. As the Ninth Circuit held on closely analogous facts, a trade dress claim premised on speculative confusion fails as a matter of law where the marks are visually distinct. Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412 (9th Cir. 2015).

CONCLUSION

For the foregoing reasons, Defendant respectfully requests that the Court grant this motion and dismiss the Complaint with prejudice.`;

/** The five real authorities the verifier should confirm against CourtListener. */
export const REAL_CITES = [
  'Bell Atlantic Corp. v. Twombly, 550 U.S. 544 (2007)',
  'Ashcroft v. Iqbal, 556 U.S. 662 (2009)',
  'Conley v. Gibson, 355 U.S. 41 (1957)',
  'Qualitex Co. v. Jacobson Products Co., 514 U.S. 159 (1995)',
  'Two Pesos, Inc. v. Taco Cabana, Inc., 505 U.S. 763 (1992)',
];

// TWO planted defects, demonstrating both non-VERIFIED failure modes:

/**
 * FLAGGED — a convincing name + cite for an opinion that does not exist at all.
 * 742 F.4th 1188 resolves to NOTHING in CourtListener → "no matching opinion".
 */
export const FLAGGED_FABRICATED_CITE =
  'Vandermeer Holdings, LLC v. Calloway Logistics, Inc., 742 F.4th 1188 (9th Cir. 2024)';
export const FLAGGED_NAME_TOKEN = 'Vandermeer';

/**
 * CITE_MISMATCH — the cite resolves to a REAL but different case. 784 F.3d 412
 * is a real opinion (Friedman v. City of Highland Park), so the cited
 * "Sunhaven … v. Meridian" case+cite pair does not exist — caught, not VERIFIED.
 */
export const MISMATCH_CITE =
  'Sunhaven Brands, LLC v. Meridian Apparel Co., 784 F.3d 412 (9th Cir. 2015)';
export const MISMATCH_NAME_TOKEN = 'Sunhaven';
