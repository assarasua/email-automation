(function seedMockData() {
  var baseCampaign = {
    id: "cmp_001",
    name: "Q2 Pipeline Expansion",
    timezone: "Europe/Madrid",
    sendWindowStart: "09:00",
    sendWindowEnd: "17:00",
    startDate: "2026-03-02",
    status: "DRAFT",
    startedAt: null
  };

  var contacts = [
    {
      id: "ct_001",
      name: "Avery Chen",
      email: "avery.chen@northbridge.ai",
      notes: "Interested in workflow automation; mentioned legacy CRM friction in discovery note.",
      source: "LinkedIn",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_002",
      name: "Sofia Ramirez",
      email: "sofia.ramirez@acmecorp.com",
      notes: "Operations lead. Asked for ROI framing and migration risk examples.",
      source: "Website",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_003",
      name: "Jonas Patel",
      email: "jonas.patel@heliohealth.io",
      notes: "Asked about HIPAA-adjacent controls and approvals. Strong buyer signal.",
      source: "CRM Import",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_004",
      name: "Mila Novak",
      email: "mila.novak@radialhq.com",
      notes: "Previously bounced in older campaign. Should remain excluded for now.",
      source: "Conference",
      eligible: false,
      suppressed: true
    },
    {
      id: "ct_005",
      name: "Ethan Brooks",
      email: "ethan.brooks@luminworks.net",
      notes: "Interested but requested slower follow-up cadence and concise copy.",
      source: "Website",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_006",
      name: "Nora Kim",
      email: "nora.kim@vectorlabs.io",
      notes: "Asked for API-first examples and timeline for pilot rollout.",
      source: "LinkedIn",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_007",
      name: "Liam Ortega",
      email: "liam.ortega@horizonops.com",
      notes: "Prefers weekly summaries and clear owner responsibilities.",
      source: "CRM Import",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_008",
      name: "Chloe Wright",
      email: "chloe.wright@zenpath.ai",
      notes: "Needs legal review before sharing internal workflow diagrams.",
      source: "Website",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_009",
      name: "Mateo Silva",
      email: "mateo.silva@sunbridge.co",
      notes: "Interested in reducing manual approvals in cross-team handoffs.",
      source: "Conference",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_010",
      name: "Ivy Turner",
      email: "ivy.turner@clearforge.com",
      notes: "Requested finance-focused value framing and implementation risk controls.",
      source: "Website",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_011",
      name: "Owen Price",
      email: "owen.price@northpeak.io",
      notes: "Past unsubscribe request still active; should remain suppressed.",
      source: "CRM Import",
      eligible: false,
      suppressed: true
    },
    {
      id: "ct_012",
      name: "Harper Collins",
      email: "harper.collins@bluegrid.net",
      notes: "Operations architect evaluating orchestration for regional teams.",
      source: "LinkedIn",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_013",
      name: "Noah Bennett",
      email: "noah.bennett@atlashealth.org",
      notes: "Interested in SLA visibility and escalation logic.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_014",
      name: "Ella Foster",
      email: "ella.foster@brightchain.ai",
      notes: "Needs examples for outbound plus inbound lead handoff workflows.",
      source: "Conference",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_015",
      name: "Henry Ross",
      email: "henry.ross@starlightops.com",
      notes: "Flagged as duplicate from previous import; keep ineligible for now.",
      source: "CRM Import",
      eligible: false,
      suppressed: false
    },
    {
      id: "ct_016",
      name: "Zoe Diaz",
      email: "zoe.diaz@pulseworks.io",
      notes: "Asked for staged deployment with clear rollback checkpoints.",
      source: "LinkedIn",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_017",
      name: "Jack Nguyen",
      email: "jack.nguyen@cobaltflow.com",
      notes: "Prefers concise follow-ups and async demo links.",
      source: "Website",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_018",
      name: "Aria Shah",
      email: "aria.shah@northfield.ai",
      notes: "Interested in reducing time-to-first-response for new leads.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_019",
      name: "Caleb Reed",
      email: "caleb.reed@harborops.io",
      notes: "Requested pricing tiers and onboarding effort estimates.",
      source: "LinkedIn",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_020",
      name: "Maya Singh",
      email: "maya.singh@openroute.net",
      notes: "Interested in integrating CRM notes into outbound personalization.",
      source: "CRM Import",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_021",
      name: "Leo Park",
      email: "leo.park@altairhq.com",
      notes: "Wants to test OOO filtering behavior before full rollout.",
      source: "Website",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_022",
      name: "Ruby Hayes",
      email: "ruby.hayes@latticeworks.ai",
      notes: "Asks for clear audit history for compliance reporting.",
      source: "LinkedIn",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_023",
      name: "Miles Cooper",
      email: "miles.cooper@opalgrid.com",
      notes: "Needs confidence in manual remove/re-add guardrails.",
      source: "Conference",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_024",
      name: "Hannah Moore",
      email: "hannah.moore@riverpoint.io",
      notes: "Interested in sequence pacing based on regional business days.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_025",
      name: "Wyatt Scott",
      email: "wyatt.scott@evergreenops.net",
      notes: "Asked to reconnect next quarter; keep suppressed for now.",
      source: "Website",
      eligible: false,
      suppressed: true
    },
    {
      id: "ct_026",
      name: "Aiden Flores",
      email: "aiden.flores@connectedhealth-example.com",
      notes: "Interested in automated follow-up orchestration across care teams.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_027",
      name: "Bella Howard",
      email: "bella.howard@connectedhealth-example.com",
      notes: "Requested examples for reducing manual handoffs in outreach.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_028",
      name: "Carter James",
      email: "carter.james@connectedhealth-example.com",
      notes: "Needs compliance-friendly audit logs for campaign actions.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_029",
      name: "Daisy Long",
      email: "daisy.long@connectedhealth-example.com",
      notes: "Asked for clear reply handling and OOO ignore behavior.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_030",
      name: "Eli Morris",
      email: "eli.morris@connectedhealth-example.com",
      notes: "Interested in segmenting contacts by source and intent signals.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_031",
      name: "Faith Parker",
      email: "faith.parker@connectedhealth-example.com",
      notes: "Prefers concise sequence copy with explicit next steps.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_032",
      name: "Gavin Reed",
      email: "gavin.reed@connectedhealth-example.com",
      notes: "Evaluating campaign guardrails for manual remove and re-add.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_033",
      name: "Hazel Stone",
      email: "hazel.stone@connectedhealth-example.com",
      notes: "Asked for send-window control by local timezone.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_034",
      name: "Isaac Bell",
      email: "isaac.bell@connectedhealth-example.com",
      notes: "Needs clear KPI visibility for response-per-email metric.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_035",
      name: "Jade Carter",
      email: "jade.carter@connectedhealth-example.com",
      notes: "Interested in keyboard-first editing for sequence templates.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_036",
      name: "Kyle Edwards",
      email: "kyle.edwards@connectedhealth-example.com",
      notes: "Requested examples of personalized drafts using contact notes.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_037",
      name: "Luna Foster",
      email: "luna.foster@connectedhealth-example.com",
      notes: "Wants to test campaign-level approval before any sends.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_038",
      name: "Mason Green",
      email: "mason.green@connectedhealth-example.com",
      notes: "Needs strict sequence day validation for governance.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_039",
      name: "Nina Hall",
      email: "nina.hall@connectedhealth-example.com",
      notes: "Interested in campaign status visibility across all campaigns.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_040",
      name: "Owen Irwin",
      email: "owen.irwin@connectedhealth-example.com",
      notes: "Asks for quick filtering by source and bulk selection.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_041",
      name: "Paige Keller",
      email: "paige.keller@connectedhealth-example.com",
      notes: "Interested in approval queue design and draft controls.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_042",
      name: "Quinn Lewis",
      email: "quinn.lewis@connectedhealth-example.com",
      notes: "Needs clear distinction between qualifying reply and OOO reply.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_043",
      name: "Riley Moore",
      email: "riley.moore@connectedhealth-example.com",
      notes: "Wants campaign operations to be simple for non-technical users.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_044",
      name: "Sophie Nash",
      email: "sophie.nash@connectedhealth-example.com",
      notes: "Requested a compact status dashboard with clear action hierarchy.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    },
    {
      id: "ct_045",
      name: "Theo Owens",
      email: "theo.owens@connectedhealth-example.com",
      notes: "Needs deterministic mock data for KPI demonstrations.",
      source: "connectedhealth",
      eligible: true,
      suppressed: false
    }
  ];

  contacts = contacts.slice(0, 20).map(function normalizeSource(contact) {
    var next = Object.assign({}, contact);
    next.source = "connectedhealth";
    return next;
  });

  var defaultSequence = [
    {
      stepIndex: 1,
      triggerDay: 0,
      composeMode: "generic",
      genericSubjectTemplate: "Quick idea for {{company}}",
      genericBodyTemplate:
        "Hi {{first_name}}, based on your note about {{pain_point}}, I drafted a lightweight approach using n8n.",
      personalizationPrompt:
        "Rewrite this as a concise personalized opener using notes context and a concrete CTA for next step.",
      lastGeneratedAt: null
    },
    {
      stepIndex: 2,
      triggerDay: 2,
      composeMode: "personalized",
      genericSubjectTemplate: "{{first_name}}, follow-up for {{company}}",
      genericBodyTemplate:
        "Hi {{first_name}}, quick follow-up based on your notes context around {{notes_context}}.",
      personalizationPrompt:
        "Generate a personalized follow-up leveraging notes context and pain point with a low-friction CTA.",
      lastGeneratedAt: null
    },
    {
      stepIndex: 3,
      triggerDay: 5,
      composeMode: "generic",
      genericSubjectTemplate: "Should I close this loop for {{company}}?",
      genericBodyTemplate:
        "If this is no longer a priority I can pause outreach, otherwise I can send a short implementation map.",
      personalizationPrompt:
        "Create a personalized final follow-up that references notes context and gives opt-out or next-step options.",
      lastGeneratedAt: null
    }
  ];

  var timezoneOptions = [
    "Europe/Madrid",
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/London",
    "Asia/Singapore"
  ];

  var campaigns = [
    baseCampaign,
    {
      id: "cmp_000",
      name: "EMEA Reactivation",
      timezone: "Europe/London",
      sendWindowStart: "08:30",
      sendWindowEnd: "16:30",
      startDate: "2026-02-20",
      status: "COMPLETED",
      startedAt: "2026-02-20T08:30:00.000Z"
    },
    {
      id: "cmp_002",
      name: "US Ops Expansion",
      timezone: "America/New_York",
      sendWindowStart: "09:00",
      sendWindowEnd: "17:00",
      startDate: "2026-02-27",
      status: "ACTIVE",
      startedAt: "2026-02-27T14:00:00.000Z"
    }
  ];

  var campaignEnrollments = {
    cmp_000: [
      {
        id: "enr_hist_0001",
        campaignId: "cmp_000",
        contactId: "ct_001",
        status: "COMPLETED",
        currentStep: 3,
        nextSendDay: null,
        nextSendAt: null,
        gmailThreadId: "thread_cmp000_ct001",
        threadState: "Completed without response",
        lastSentStep: 3,
        removedReason: null,
        removedBy: null,
        removedAt: null
      },
      {
        id: "enr_hist_0002",
        campaignId: "cmp_000",
        contactId: "ct_003",
        status: "RESPONDED",
        currentStep: 2,
        nextSendDay: null,
        nextSendAt: null,
        gmailThreadId: "thread_cmp000_ct003",
        threadState: "Human reply received",
        lastSentStep: 2,
        removedReason: null,
        removedBy: null,
        removedAt: null
      },
      {
        id: "enr_hist_0003",
        campaignId: "cmp_000",
        contactId: "ct_005",
        status: "MANUALLY_REMOVED",
        currentStep: 1,
        nextSendDay: null,
        nextSendAt: null,
        gmailThreadId: "thread_cmp000_ct005",
        threadState: "Manually removed",
        lastSentStep: 1,
        removedReason: "Requested pause",
        removedBy: "demo.user@local",
        removedAt: "2026-02-21T09:15:00.000Z"
      }
    ],
    cmp_002: [
      {
        id: "enr_hist_2001",
        campaignId: "cmp_002",
        contactId: "ct_002",
        status: "ACTIVE",
        currentStep: 2,
        nextSendDay: 4,
        nextSendAt: "2026-03-03T14:00:00.000Z",
        gmailThreadId: "thread_cmp002_ct002",
        threadState: "Awaiting reply",
        lastSentStep: 1,
        removedReason: null,
        removedBy: null,
        removedAt: null
      },
      {
        id: "enr_hist_2002",
        campaignId: "cmp_002",
        contactId: "ct_001",
        status: "STOPPED",
        currentStep: 2,
        nextSendDay: null,
        nextSendAt: null,
        gmailThreadId: "thread_cmp002_ct001",
        threadState: "Stopped manually",
        lastSentStep: 1,
        removedReason: null,
        removedBy: null,
        removedAt: null
      },
      {
        id: "enr_hist_2003",
        campaignId: "cmp_002",
        contactId: "ct_005",
        status: "ACTIVE",
        currentStep: 1,
        nextSendDay: 2,
        nextSendAt: "2026-03-01T14:00:00.000Z",
        gmailThreadId: "thread_cmp002_ct005",
        threadState: "Not sent yet",
        lastSentStep: 0,
        removedReason: null,
        removedBy: null,
        removedAt: null
      }
    ],
    cmp_001: []
  };

  var events = [
    {
      id: "evt_seed_0001",
      type: "send",
      campaignId: "cmp_002",
      contactId: "ct_002",
      stepIndex: 1,
      timestamp: "2026-02-27T14:10:00.000Z",
      meta: { campaignId: "cmp_002" }
    },
    {
      id: "evt_seed_0002",
      type: "send",
      campaignId: "cmp_002",
      contactId: "ct_001",
      stepIndex: 1,
      timestamp: "2026-02-27T14:18:00.000Z",
      meta: { campaignId: "cmp_002" }
    },
    {
      id: "evt_seed_0003",
      type: "qualifying_reply",
      campaignId: "cmp_002",
      contactId: "ct_002",
      stepIndex: 1,
      timestamp: "2026-02-27T16:05:00.000Z",
      meta: { campaignId: "cmp_002" }
    },
    {
      id: "evt_seed_0004",
      type: "send",
      campaignId: "cmp_002",
      contactId: "ct_005",
      stepIndex: 1,
      timestamp: "2026-02-28T14:05:00.000Z",
      meta: { campaignId: "cmp_002" }
    },
    {
      id: "evt_seed_0005",
      type: "ooo_reply",
      campaignId: "cmp_002",
      contactId: "ct_005",
      stepIndex: 1,
      timestamp: "2026-02-28T14:25:00.000Z",
      meta: { campaignId: "cmp_002" }
    },
    {
      id: "evt_seed_0006",
      type: "send",
      campaignId: "cmp_000",
      contactId: "ct_001",
      stepIndex: 1,
      timestamp: "2026-02-20T08:40:00.000Z",
      meta: { campaignId: "cmp_000" }
    },
    {
      id: "evt_seed_0007",
      type: "send",
      campaignId: "cmp_000",
      contactId: "ct_003",
      stepIndex: 1,
      timestamp: "2026-02-20T08:50:00.000Z",
      meta: { campaignId: "cmp_000" }
    },
    {
      id: "evt_seed_0008",
      type: "qualifying_reply",
      campaignId: "cmp_000",
      contactId: "ct_003",
      stepIndex: 1,
      timestamp: "2026-02-20T11:10:00.000Z",
      meta: { campaignId: "cmp_000" }
    },
    {
      id: "evt_seed_0009",
      type: "send",
      campaignId: "cmp_000",
      contactId: "ct_005",
      stepIndex: 1,
      timestamp: "2026-02-21T08:45:00.000Z",
      meta: { campaignId: "cmp_000" }
    },
    {
      id: "evt_seed_0010",
      type: "send",
      campaignId: "cmp_000",
      contactId: "ct_001",
      stepIndex: 2,
      timestamp: "2026-02-22T08:45:00.000Z",
      meta: { campaignId: "cmp_000" }
    }
  ];

  window.MockData = {
    campaign: baseCampaign,
    campaigns: campaigns,
    campaignEnrollments: campaignEnrollments,
    events: events,
    contacts: contacts,
    defaultSequence: defaultSequence,
    timezoneOptions: timezoneOptions
  };
})();
