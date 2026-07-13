# AI Patient Engagement — Gap Matrix & Messaging Guide

Stakeholder reference for what Acufore Health can promote today versus after each integration phase.

## Coverage vs framework

| Framework pillar | Current maturity | Promote now? | After phase |
|---|---|---|---|
| Continuous communication (portal chat, in-app alerts) | Partial | Yes | Phase 1 adds omnichannel |
| Collaboration (family, referrals consent, telemedicine) | Partial | Yes | Phase 3 deepens shared decisions |
| Secure information sharing (JWT, records) | Good | Yes | — |
| Shared decision-making | Missing | No | Phase 3 |
| Personalized guidance (Care Overview, AI chat) | Partial | Yes | Phase 2 care-gap personalization |
| Convenient access (book, video, radiology) | Good | Yes | — |
| Preventive / predictive care | Missing | No | Phase 2–3 |
| Medication adherence | Partial (manual WhatsApp) | Limited | Phase 2 |
| Chronic condition support | Staff analytics only | Limited | Phase 2 |
| SDOH support | Missing | No | Phase 3 |
| Multi-channel outreach | In-app + WhatsApp | Limited | Phase 1 (email + SMS) |
| Engagement measurement KPIs | Missing (token usage only) | No | Phase 1 baseline / Phase 3 full |
| Staff front-desk engagement ops | Good | Yes | Phase 1 console + KPIs |

## Safe messaging today

- AI patient assistant (24/7, family-aware)
- Unified patient journey: appointments, telemedicine, radiology, records
- Family-centered engagement
- In-app notifications and referral consent
- AI Care Overview on the patient dashboard
- Front-desk AI scheduling and patient lookup

## Promote after Phase 1

- Omnichannel patient engagement (in-app + email + SMS + WhatsApp)
- Automated appointment reminders and no-show follow-ups
- Provider engagement analytics (baseline KPIs)
- Patient engagement preferences and care-task hub
- Connected billing in the patient portal

## Promote after Phase 2–3

- Predictive preventive care and care-gap outreach
- Medication adherence program with patient check-in
- SDOH-aware support and resource directory
- Shared decision-making tools
- Full engagement analytics (satisfaction, adherence, campaign ROI)

## Compliance notes

- Channel opt-in/consent must be stored per patient.
- AI outreach includes a non-diagnostic disclaimer.
- All outbound engagement is audited in `engagement_events`.
