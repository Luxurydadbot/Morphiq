# Hypergentiq Privacy Policy — DRAFT (Prepared for Attorney Review)

> **Status: on hold.** Drafted by Claude on 2026-08-09 based on a direct
> review of the app's actual code and data-handling practices. This is a
> factual first draft, **not legal advice**, and has not been reviewed by a
> licensed attorney. Do not publish or link to this from the live app.
>
> **Real blocker (as of 2026-08-09):** Bryant does not yet have a registered
> legal business entity for Hypergentiq. A lawyer can't meaningfully review
> a privacy policy for a company that doesn't legally exist yet — this is
> blocked on business formation, not just "find a lawyer." Once a legal
> entity exists, fill in the bracketed placeholders below (also listed
> together in the Appendix) and send to counsel.
>
> Effective Date: **[EFFECTIVE DATE — set when published]**

---

## 1. Introduction

Hypergentiq ("Hypergentiq," "we," "us," or "our") provides an AI-powered
fitness and nutrition coaching application (the "App") that gyms and
fitness studios ("Partner Gyms") license and offer to their own members
under their own branding, at no direct cost to the member. This Privacy
Policy explains what information we collect through the App, how we use
and share it, and the choices and rights available to you.

This Policy applies to individual members who use the App through a
Partner Gym ("Members," "you"), and to the owners and staff of Partner
Gyms who manage their gym's account ("Gym Owners"). It does not apply to
Partner Gyms' own separate websites, marketing, or in-person services.

Hypergentiq's legal entity is **[LEGAL ENTITY NAME, e.g. "Hypergentiq,
Inc." or "Hypergentiq LLC" — not yet formed]**, located at **[REGISTERED
BUSINESS ADDRESS]**. For purposes of applicable privacy law, Hypergentiq
acts as the data controller/business for account and app-usage data, and
Partner Gyms act as independent data controllers/businesses for their own
billing and gym-management relationship with their members.

## 2. Information We Collect

We collect the following categories of information, verified directly
against what the App's code actually does — not a generic template.

### 2.1 Account & Onboarding Information

When you create an account and set up your profile, we collect:

- Name and email address
- Sex, age, height, and weight
- Fitness goal (e.g., build muscle, lose fat, general fitness)
- Training experience, recent activity level, and workout frequency preference
- Available equipment and workout-location preferences
- Injuries or physical limitations you choose to disclose, so the App can avoid unsafe exercises

### 2.2 Health & Fitness Activity Data

As you use the App, we collect the data you generate through normal use:

- Workout logs: exercises performed, sets, reps, weights used, and workout dates
- Meal and nutrition logs, including estimated calories, protein, carbohydrates, and fat
- Cardio session logs
- Body-measurement and progress data you choose to enter

This is fitness and wellness data you provide voluntarily. It is not
medical or clinical data collected by a healthcare provider, and
Hypergentiq is not a covered entity under HIPAA. See Section 8, "Health
Disclaimer," below.

### 2.3 Meal Photos

If you use the photo meal-logging feature, the photo you take is sent
securely to our AI provider (see Section 4) to estimate the food's
nutritional content. **Based on our review of the App's code, these
photos are processed to generate a nutrition estimate and are not
separately saved to Hypergentiq's database afterward.** **[CONFIRM: does
the AI provider (Anthropic) retain submitted images, and for how long,
under Hypergentiq's API agreement?]**

### 2.4 Voice Input

The App supports voice commands (e.g., logging a set by saying a number).
Speech-to-text conversion is performed by your own device's browser, not
by Hypergentiq's servers. Hypergentiq receives and processes only the
resulting text, never a raw audio recording.

### 2.5 AI Coach Conversations

Messages you send to the in-app AI coach chat are transmitted to our AI
provider to generate a response, along with relevant context (such as
your goal, recent workouts, and current plan) needed to make that
response useful.

### 2.6 Payment Information (Gym Owners only)

Partner Gyms pay Hypergentiq a subscription fee. Payment card details are
collected and processed directly by our payment processor, Stripe;
Hypergentiq's own systems store only a subscription status, plan tier,
and Stripe's own reference IDs — never full card numbers. Individual
Members never pay Hypergentiq directly and do not provide payment
information through the App.

### 2.7 Gym Branding Information (Gym Owners only)

Gym Owners may upload a gym name, logo, welcome message, and accent color
to customize their gym's branded version of the App for their own
members.

### 2.8 Technical, Device & Usage Data

- Device and browser type
- Crash and error reports, used to fix bugs — configured to exclude personal information by default
- General app-usage patterns (e.g., which screens are used) and login timestamps
- Locally on your own device: your browser's local storage is used to save in-progress workout state, so you don't lose your place if you close the App mid-workout. This data stays on your device.

## 3. How We Use Your Information

We use the information above to:

- Generate and personalize your workout plans, meal guidance, and AI coach feedback
- Track your progress and workout history over time
- Let Gym Owners manage their own gym's branding, member roster, and billing
- Authenticate your account and keep it secure
- Diagnose and fix technical problems
- Communicate service updates, billing notices, or changes to this Policy
- Comply with legal obligations and enforce our Terms of Service

We do not use your health or fitness data to make advertising, insurance,
or employment-related decisions, and we do not sell your personal
information to third parties.

## 4. How Information Is Shared

We share information only as described here. We do not sell personal
information.

### 4.1 Service Providers ("Subprocessors")

We use the following third-party service providers to operate the App.
Each processes data only on our instructions and only as needed to
provide their service:

- **Supabase** — database hosting and storage for account and app data
- **Anthropic (Claude AI)** — processes AI chat messages, meal photos, and generates coach notes and plan content
- **Stripe** — payment processing for Gym Owner subscriptions
- **Vercel** — application hosting
- **Sentry** — error and crash monitoring, configured to exclude personal information by default

A current list of subprocessors can be provided on request to **[PRIVACY
CONTACT EMAIL]**.

### 4.2 Gym Owners

Because Hypergentiq is offered to you through your gym, your gym's
owner/staff can see account and activity information for members of
their own gym (such as your name and workout participation), to support
their own members. Gym Owners cannot see data belonging to members of a
different, unaffiliated gym.

### 4.3 Legal & Safety

We may disclose information if required by law, subpoena, or other legal
process, or where we believe in good faith it's necessary to protect the
rights, property, or safety of Hypergentiq, our users, or the public.

### 4.4 Business Transfers

If Hypergentiq is involved in a merger, acquisition, or sale of assets,
information may be transferred as part of that transaction, subject to
the commitments in this Policy.

## 5. Data Retention

We retain your information for as long as your account is active. If you
or your Gym Owner request account deletion, we will delete or anonymize
your personal information within **[RETENTION PERIOD, e.g. "30 days" —
pick a real operational commitment]**, except where we are required to
retain certain records for longer (for example, financial and billing
records related to Gym Owner subscriptions).

## 6. Your Rights & Choices

Depending on where you live, you may have the right to:

- Access the personal information we hold about you
- Correct inaccurate information
- Request deletion of your information
- Request a copy of your information in a portable format
- Opt out of non-essential communications

To exercise any of these rights, contact us at **[PRIVACY CONTACT
EMAIL]**. We will respond within the timeframe required by applicable
law.

### 6.1 California Residents

If you are a California resident, the California Consumer Privacy Act
(CCPA), as amended, gives you the rights described above, as well as the
right to non-discrimination for exercising them. Hypergentiq does not
sell or share personal information as those terms are defined under the
CCPA. **[COUNSEL: confirm final CCPA/CPRA compliance language, required
disclosures, and whether a "Do Not Sell or Share My Personal Information"
link is needed given current data practices]**

### 6.2 European/UK Users

If Hypergentiq processes personal information of individuals located in
the EU/EEA or UK, additional rights and requirements may apply under the
GDPR/UK GDPR (such as a documented legal basis for processing and rights
to restrict or object to processing). **[COUNSEL: confirm whether the App
currently has any EU/UK users or Partner Gyms, and whether GDPR/UK GDPR
provisions need to be built out further, including a Data Processing
Agreement template for Partner Gyms]**

## 7. Children's Privacy

The App is not directed to, and is not intended for use by, children
under the age of **[MINIMUM AGE — confirm 13, 16, or another figure based
on target market and applicable law]**. We do not knowingly collect
personal information from children under that age. If we learn that we
have collected personal information from a child without appropriate
consent, we will delete it promptly. Gym Owners are responsible for
ensuring that individuals they enroll in the App meet Hypergentiq's
minimum age requirement.

## 8. Health Disclaimer

Hypergentiq provides fitness and nutrition guidance generated with the
assistance of artificial intelligence. It is intended for general fitness
purposes only and is **not a substitute for professional medical advice,
diagnosis, or treatment.** Always consult a physician or other qualified
health provider before starting a new exercise or nutrition program,
especially if you have any pre-existing medical condition, injury, or
concern. Never disregard professional medical advice or delay seeking it
because of something generated by the App.

## 9. Data Security

We use industry-standard safeguards to protect your information,
including encrypted connections (HTTPS) between the App and our servers,
and access controls limiting who can view account data. Payment card
information is handled directly by Stripe and never stored on
Hypergentiq's own servers. No method of transmission or storage is 100%
secure, and we cannot guarantee absolute security.

## 10. International Data Transfers

Our service providers primarily operate infrastructure in the **[CONFIRM
PRIMARY HOSTING REGION, e.g. "United States"]**. If you access the App
from outside that region, your information will be transferred to,
stored, and processed there.

## 11. Changes to This Policy

We may update this Policy from time to time. If we make material
changes, we will provide notice (such as an in-app notice or email to Gym
Owners) before the changes take effect. The "Effective Date" at the top
of this Policy indicates when it was last revised.

## 12. Contact Us

Questions about this Policy or your information can be sent to
**[PRIVACY CONTACT EMAIL]**, or by mail to **[REGISTERED BUSINESS
ADDRESS]**.

---

## Appendix: Placeholders to Resolve Before Publishing

- Legal entity name (Section 1) — **blocked: business not yet formed**
- Registered business address (Sections 1, 10, 12)
- Whether Anthropic retains submitted meal photos, and for how long (Section 2.3)
- Privacy contact email (Sections 4.1, 6, 6.1, 12)
- Data retention period commitment (Section 5)
- CCPA/CPRA final compliance language (Section 6.1)
- Whether GDPR/UK GDPR provisions are currently needed (Section 6.2)
- Minimum user age (Section 7)
- Primary hosting region confirmation (Section 10)
- Effective date, to be set at publish time (title page)

A formatted .docx version of this same draft was also generated and given
directly to Bryant in the same session this was written.
