# Hypergentiq Terms of Service — DRAFT (Prepared for Attorney Review)

> **Status: on hold.** Drafted by Claude on 2026-08-22 based on a direct
> review of the app's actual code and business practices, as a companion
> document to `PRIVACY_POLICY_DRAFT.md`. This is a factual first draft,
> **not legal advice**, and has not been reviewed by a licensed attorney.
> Do not publish or link to this from the live app.
>
> **Real blocker (as of 2026-08-22), same as the privacy policy:** Bryant
> does not yet have a registered legal business entity for Hypergentiq.
> Once one exists, fill in the bracketed placeholders below (also listed
> together in the Appendix) and send this and `PRIVACY_POLICY_DRAFT.md` to
> counsel together — they should be reviewed as a pair, not separately.
>
> Effective Date: **[EFFECTIVE DATE — set when published]**

---

## 1. Introduction and Acceptance

These Terms of Service ("Terms") govern use of Hypergentiq ("Hypergentiq,"
"we," "us," or "our"), an AI-powered fitness and nutrition coaching
application (the "App") licensed by gyms and fitness studios ("Partner
Gyms") and offered by them to their own members under their own branding.

These Terms apply to two different groups, described separately below where
their rights and obligations differ:

- **Gym Owners** — the owners and staff of Partner Gyms who license the App
  and manage their gym's account, branding, and billing.
- **Members** — individuals who use the App through a Partner Gym at no
  direct cost to themselves.

By creating an account, or by tapping "I agree" during onboarding, you
accept these Terms. If you do not agree, do not use the App.

Hypergentiq's legal entity is **[LEGAL ENTITY NAME — not yet formed]**,
located at **[REGISTERED BUSINESS ADDRESS]**.

## 2. Eligibility

You must be at least **13 years old** to use the App, matching the
confirmation every Member is shown and must accept before a plan is built.
Gym Owners must be at least 18 years old and have authority to bind their
gym to these Terms. Gym Owners are responsible for ensuring that
individuals they enroll in the App meet Hypergentiq's minimum age
requirement — see `PRIVACY_POLICY_DRAFT.md` Section 7 for the matching
privacy commitment.

## 3. The Service

Hypergentiq generates AI-assisted workout plans, nutrition guidance, and
coaching feedback, and lets Members log workouts, meals, cardio sessions,
and body-weight progress over time. Gym Owners can customize their gym's
branded version of the App (name, logo, welcome message) and manage their
own member roster and billing.

**Hypergentiq may add, change, or remove features at any time.** We aim to
keep the App available, but do not guarantee uninterrupted or error-free
service — see Section 9 ("Disclaimers") below.

## 4. Gym Owner Accounts, Billing, and Subscriptions

### 4.1 Plans and Pricing

As of this draft, three subscription plans are available, each billing a
flat monthly fee plus a per-active-member usage fee (an "active member" is
one who logs at least one workout that billing month):

- **Starter** — $99/month + $2/active member
- **Growth** — $199/month + $1.75/active member
- **Scale** — $399/month + $1.50/active member

**[COUNSEL: confirm pricing changes require notice under applicable law
before taking effect for existing subscribers, and add that commitment
here if so.]**

### 4.2 Free Trial

New Gym Owner subscriptions include a **14-day free trial**, run through
Stripe's subscription billing. **[CONFIRM: what happens if a Gym Owner
does not cancel before the trial ends — do they need to affirmatively
confirm continuation, or does billing begin automatically? Reflect
whichever is actually true in the Stripe configuration here, since this is
a common area of regulatory scrutiny (e.g., FTC "negative option" rules)
and the language must match the real mechanism exactly.]**

### 4.3 Payment Processing

All payment is handled directly by Stripe, our third-party payment
processor. Hypergentiq does not collect or store full payment card
numbers. By subscribing, a Gym Owner agrees to Stripe's own terms of
service in addition to these Terms.

### 4.4 Cancellation and Refunds

**[COUNSEL / BRYANT: this section needs a real, operational policy —
nothing in the code currently defines a cancellation or refund process
beyond what Stripe's own subscription-management tools provide by
default. Decide: can a Gym Owner cancel at any time and stop being billed
at the end of the current period? Are partial-month refunds offered? Spell
out the actual mechanism once decided.]**

### 4.5 Suspension for Non-Payment or Violation

Hypergentiq may suspend a Gym Owner's account — and, in turn, their
members' access — for non-payment, violation of these Terms, or other
reasonable cause. As of this draft, suspension is a manual action taken by
Hypergentiq's platform administrator, not an automated non-payment
lockout. **[CONFIRM: is automatic suspension for a failed/declined payment
planned? If so, describe the actual grace period.]**

## 5. Member Accounts

### 5.1 No Cost to Members

Members never pay Hypergentiq directly. Access is provided through a
Partner Gym's paid license, at no direct cost to the Member.

### 5.2 One Account, One Gym

A Member's account and data are associated with the specific Partner Gym
that enrolled them. Gym Owners can see account and activity information
for members of their own gym only — never members of a different,
unaffiliated gym (see `PRIVACY_POLICY_DRAFT.md` Section 4.2).

### 5.3 Account Deletion

A Member may permanently delete their own account and all associated data
at any time, from inside the App itself (Profile → Delete my account).
This is irreversible: it permanently removes the Member's workout, meal,
weight, and cardio history, along with their login itself. **[Built Aug
22, 2026 — see `api/delete-account.js`. This satisfies Apple App Store
Review Guideline 5.1.1(v), which requires in-app account deletion for any
app that supports account creation.]**

### 5.4 Restarting or Leaving

A Member may also restart their onboarding quiz to rebuild their plan from
scratch, or sign out, without deleting their account or history.

## 6. Health, Fitness, and AI-Generated Content Disclaimer

**This section mirrors the disclaimer already shown to every Member during
onboarding (`src/OnboardingScreen.jsx`) — kept consistent on purpose rather
than introducing different wording in a legal document than what the App
itself displays.**

The fitness and nutrition plans, coaching feedback, and meal/food
estimates provided by Hypergentiq are generated with the assistance of
artificial intelligence and are for **informational and educational
purposes only**. They do not constitute medical advice and are not a
substitute for professional medical advice, diagnosis, or treatment.

Always consult a physician or other qualified healthcare provider before
starting a new exercise or nutrition program, especially if you have any
pre-existing medical condition, injury, or concern. You agree to exercise
within your own limits and accept responsibility for your own health and
safety while using the App. Hypergentiq is not a covered entity under
HIPAA and does not provide clinical or medical services — see
`PRIVACY_POLICY_DRAFT.md` Section 2.2.

**AI-generated content may contain errors.** Nutrition estimates (including
photo-based meal estimates) are approximations, not laboratory-verified
values. Hypergentiq is not liable for decisions made in reliance on
AI-generated plans, feedback, or estimates. **[COUNSEL: confirm this
disclaimer, paired with the limitation-of-liability language in Section 10
below, is sufficient given the App is squarely a consumer fitness product,
not a medical device or clinical tool.]**

## 7. Acceptable Use

You agree not to:

- Use the App for any unlawful purpose, or in violation of any applicable
  law or regulation
- Attempt to access another Member's or Gym's data without authorization
- Interfere with or disrupt the App's normal operation, or attempt to
  circumvent any security or access-control measure
- Reverse-engineer, decompile, or attempt to extract the App's source code,
  except where applicable law expressly permits it
- Impersonate any person or entity, or misrepresent your affiliation with
  a Partner Gym

Hypergentiq may suspend or terminate access for violation of this section.

## 8. Intellectual Property

### 8.1 Hypergentiq's Property

The App, including its underlying software, design, and the Hypergentiq
name and logo, is owned by Hypergentiq and protected by applicable
intellectual property laws. These Terms do not grant you any ownership
interest in the App.

### 8.2 Gym Branding

Gym Owners retain ownership of their own gym name, logo, and branding
materials uploaded to customize their branded version of the App
(`src/GymOwnerDashboard.jsx`), and grant Hypergentiq a license to display
that branding within the App solely for the purpose of operating their
gym's branded experience. A "Powered by Hypergentiq" attribution appears
on every Member-facing screen and cannot be removed by a Gym Owner — see
`PRIVACY_POLICY_DRAFT.md` Section 2.7 and the project's own design
standards for this requirement's origin.

### 8.3 Member Content

Data a Member enters (injuries noted, custom exercise names, chat messages)
remains theirs; by using the App, a Member grants Hypergentiq a license to
use that information solely to provide and improve the service, consistent
with `PRIVACY_POLICY_DRAFT.md`.

## 9. Disclaimers

THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY
KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
NON-INFRINGEMENT. HYPERGENTIQ DOES NOT WARRANT THAT THE APP WILL BE
UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT AI-GENERATED CONTENT WILL BE
ACCURATE. **[COUNSEL: standard boilerplate — confirm this reflects the
entity's actual risk posture once formed, and that ALL-CAPS conspicuous
disclaimer formatting satisfies the applicable jurisdiction's requirements
for warranty disclaimers to be enforceable.]**

## 10. Limitation of Liability

**[COUNSEL: this section is the single most important one for a real
attorney to draft or substantially rewrite, not just review — a
generic liability cap here without proper jurisdiction-specific drafting
is one of the more common ways a startup's Terms fail to actually protect
it. Placeholder direction only:]** To the maximum extent permitted by law,
Hypergentiq's total liability arising out of or relating to these Terms or
the App shall not exceed **[AMOUNT — e.g., fees paid by the applicable Gym
Owner in the preceding 12 months, or a fixed dollar figure; Members pay
nothing directly, so a Member-side cap needs its own real answer]**, and
Hypergentiq shall not be liable for indirect, incidental, special,
consequential, or punitive damages.

## 11. Indemnification

**[COUNSEL: standard mutual or one-directional indemnification clause,
drafted properly for the actual entity structure once formed — not filled
in here since this is genuinely attorney-drafting territory, not a
fill-in-the-blank.]**

## 12. Termination

Hypergentiq may suspend or terminate a Gym Owner's or Member's access for
violation of these Terms, non-payment (Gym Owners), or at Hypergentiq's
reasonable discretion with notice where practicable. A Member may delete
their own account at any time per Section 5.3. A Gym Owner's cancellation
terms are per Section 4.4 above.

## 13. Governing Law and Dispute Resolution

**[COUNSEL / BRYANT: depends entirely on where the legal entity is
formed — cannot be filled in until that's decided. Common approach for a
company this size: governing law of the state of incorporation, plus an
arbitration clause and class-action waiver, but whether arbitration is
appropriate here (a consumer-facing product, albeit one Members don't pay
for directly) is a real question for counsel, not a default to assume.]**

## 14. Changes to These Terms

Hypergentiq may update these Terms from time to time. If we make material
changes, we will provide notice (such as an in-app notice or email to Gym
Owners) before the changes take effect, matching the same commitment made
in `PRIVACY_POLICY_DRAFT.md` Section 11.

## 15. Contact

Questions about these Terms can be sent to **[LEGAL/PRIVACY CONTACT
EMAIL — same address as `PRIVACY_POLICY_DRAFT.md` Section 12, once one
exists]**.

---

## Appendix: Placeholders to Resolve Before Publishing

- Legal entity name and address (Section 1) — **blocked: business not yet
  formed, same blocker as the privacy policy**
- Pricing-change notice commitment, if any (Section 4.1)
- Exact trial-to-paid conversion mechanism, confirmed against the live
  Stripe configuration (Section 4.2)
- Real cancellation and refund policy — currently undefined anywhere in
  the app or business practice (Section 4.4)
- Whether automatic non-payment suspension is planned (Section 4.5)
- Liability cap amount, once the entity and its risk tolerance are known
  (Section 10)
- Full indemnification clause (Section 11)
- Governing law / arbitration decision (Section 13)
- Contact email (Section 15)
- Effective date, to be set at publish time (title page)

A formatted .docx version of this same draft was also generated and given
directly to Bryant in the same session this was written, alongside the
existing `PRIVACY_POLICY_DRAFT.md` — send both to counsel together, not
separately, since several sections cross-reference one another.
