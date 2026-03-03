(function appBootstrap() {
  var MAX_SEQUENCE_STEPS = 10;
  var APPROVAL_ACTOR = "demo.user@local";
  var REMOVE_UNDO_MS = 10000;
  var COMPOSE_MODE = {
    GENERIC: "generic",
    PERSONALIZED: "personalized"
  };

  var STATUS = {
    DRAFT: "DRAFT",
    APPROVED: "APPROVED",
    ACTIVE: "ACTIVE",
    STOPPED: "STOPPED",
    RESPONDED: "RESPONDED",
    COMPLETED: "COMPLETED",
    MANUALLY_REMOVED: "MANUALLY_REMOVED",
    SUPPRESSED: "SUPPRESSED"
  };

  var SCREENS = [
    { id: "audience", label: "Audience" },
    { id: "sequence", label: "Sequence" },
    { id: "approval", label: "Campaign Approval" }
  ];
  var STATUS_SCREEN = { id: "status", label: "Campaigns Hub" };

  var lastFocusedElement = null;
  var removeUndoTimer = null;
  var state = buildInitialState();

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // State Initialization & Normalization
  function normalizeSequenceStep(step, index) {
    var normalized = Object.assign({}, step || {});
    var legacySubject = String(normalized.subjectTemplate || "").trim();
    var legacyBody = String(normalized.bodyTemplate || "").trim();

    normalized.stepIndex = Number.isInteger(normalized.stepIndex) ? normalized.stepIndex : index + 1;
    normalized.triggerDay = Number.isInteger(normalized.triggerDay) ? normalized.triggerDay : null;
    normalized.composeMode =
      normalized.composeMode === COMPOSE_MODE.PERSONALIZED ? COMPOSE_MODE.PERSONALIZED : COMPOSE_MODE.GENERIC;
    normalized.genericSubjectTemplate = String(normalized.genericSubjectTemplate || legacySubject || "");
    normalized.genericBodyTemplate = String(normalized.genericBodyTemplate || legacyBody || "");
    normalized.personalizationPrompt = String(
      normalized.personalizationPrompt ||
        "Rewrite this step as a personalized outreach email using recipient notes context and clear next-step CTA."
    );
    normalized.lastGeneratedAt = normalized.lastGeneratedAt || null;
    normalized.generationMeta = normalized.generationMeta || null;

    return normalized;
  }

  function getStepSubjectTemplate(step) {
    return String((step && step.genericSubjectTemplate) || "");
  }

  function getStepBodyTemplate(step) {
    return String((step && step.genericBodyTemplate) || "");
  }

  function buildInitialState() {
    var seed = window.MockData || {
      campaign: {},
      contacts: [],
      defaultSequence: [],
      timezoneOptions: ["UTC"]
    };

    var selectedContactIds = {};
    var preselectCount = 0;
    var campaignRegistry = Array.isArray(seed.campaigns) ? deepClone(seed.campaigns) : [];
    var campaignEnrollments =
      seed.campaignEnrollments && typeof seed.campaignEnrollments === "object"
        ? deepClone(seed.campaignEnrollments)
        : {};

    seed.contacts.forEach(function preselect(contact) {
      if (contact.eligible && !contact.suppressed && preselectCount < 3) {
        selectedContactIds[contact.id] = true;
        preselectCount += 1;
      }
    });

    if (seed.campaign && seed.campaign.id) {
      var hasCurrentCampaign = campaignRegistry.some(function exists(campaign) {
        return campaign.id === seed.campaign.id;
      });
      if (!hasCurrentCampaign) {
        campaignRegistry.unshift(deepClone(seed.campaign));
      }
      if (!Array.isArray(campaignEnrollments[seed.campaign.id])) {
        campaignEnrollments[seed.campaign.id] = [];
      }
    }

    return {
      idCounter: 1,
      activeScreen: "audience",
      notice: null,
      campaign: deepClone(seed.campaign),
      campaignRegistry: campaignRegistry,
      campaignEnrollments: campaignEnrollments,
      contacts: deepClone(seed.contacts),
      timezoneOptions: deepClone(seed.timezoneOptions),
      sequenceSteps: (seed.defaultSequence || []).map(function mapStep(step, idx) {
        return normalizeSequenceStep(step, idx);
      }),
      selectedContactIds: selectedContactIds,
      enrollments: deepClone(campaignEnrollments[seed.campaign.id] || []),
      draftApprovalItems: [],
      events: deepClone(seed.events || []),
      simulationDay: 0,
      ui: {
        workflowStepStatus: {
          audience: "ready",
          sequence: "locked",
          approval: "locked"
        },
        sourceSearch: "",
        isContactFilterMenuOpen: false,
        contactFilterField: "name",
        contactFilterValue: "",
        contactFilterSource: "",
        contactFilterStatus: "",
        audienceContactsPage: 1,
        audienceContactsPageSize: 25,
        audienceContactsPageSizeOptions: [25, 50, 100],
        hubContactsPage: 1,
        hubContactsPageSize: 25,
        hubContactsPageSizeOptions: [25, 50, 100],
        selectVisibleState: "none",
        audienceSubStep: 1,
        audienceCollapsed: {
          contacts: false,
          campaignSetup: false
        },
        audienceValidation: {},
        sequenceValidationByStep: {},
        expandedStepIndex: 1,
        editorFocus: null,
        lastSavedAtByStep: {},
        sequencePreview: {
          exampleContactIdByStep: {},
          exampleSubjectByStep: {},
          exampleBodyByStep: {},
          lastPreviewedAtByStep: {}
        },
        approvalFilter: "all",
        statusFilter: "all",
        isCampaignDirectoryCollapsed: false,
        selectedStatusCampaignId: null,
        statusJourneyStep: 1,
        statusJourneyVisited: {
          1: true,
          2: false,
          3: false,
          4: false
        },
        activityFilterAction: "all",
        activitySortBy: "time",
        activitySortDir: "desc",
        activityPage: 1,
        activityPageSize: 50,
        activityPageSizeOptions: [25, 50, 100],
        statusViewMode: "review",
        bulkActionConfirmOpen: false,
        campaignApproval: {
          approved: false,
          approvedAt: null,
          approvedBy: null
        },
        startCampaignConfirmOpen: false,
        statusChangeConfirm: {
          scope: null,
          campaignId: null,
          enrollmentId: null,
          targetStatus: null
        },
        removeUndo: {
          enrollmentId: null,
          expiresAt: null,
          snapshot: null
        },
        approvalInvalidatedReason: null,
        removeModalTargetId: null,
        removeReason: "",
        lastFocusedActionId: null
      }
    };
  }

  function nextId(prefix) {
    var id = prefix + "_" + String(state.idCounter).padStart(5, "0");
    state.idCounter += 1;
    return id;
  }

  // Pure Helpers / Formatters
  function setNotice(kind, text) {
    state.notice = {
      kind: kind,
      text: text
    };
  }

  function clearNotice() {
    state.notice = null;
  }

  function escapeHtml(raw) {
    return String(raw)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function truncate(text, length) {
    var safe = String(text || "");
    return safe.length > length ? safe.slice(0, length - 1) + "…" : safe;
  }

  function disabledAttr(reason) {
    return reason ? ' disabled aria-disabled="true"' : "";
  }

  function reasonHint(reason) {
    return reason ? '<p class="action-note">' + escapeHtml(reason) + "</p>" : "";
  }

  function paginateRows(rows, page, pageSize) {
    var safeRows = Array.isArray(rows) ? rows : [];
    var safePageSize = Math.max(1, Number(pageSize || 25));
    var totalItems = safeRows.length;
    var totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    var currentPage = Math.min(totalPages, Math.max(1, Number(page || 1)));
    var start = (currentPage - 1) * safePageSize;
    var end = Math.min(start + safePageSize, totalItems);

    return {
      pageRows: safeRows.slice(start, end),
      totalItems: totalItems,
      totalPages: totalPages,
      currentPage: currentPage,
      startIndex: totalItems ? start + 1 : 0,
      endIndex: end
    };
  }

  function isEditableElement(element) {
    if (!element) {
      return false;
    }
    var tag = String(element.tagName || "").toUpperCase();
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      element.isContentEditable ||
      !!element.closest("[contenteditable='true']")
    );
  }

  function getContact(contactId) {
    return state.contacts.find(function findContact(contact) {
      return contact.id === contactId;
    });
  }

  function getEnrollment(enrollmentId) {
    return state.enrollments.find(function findEnrollment(enrollment) {
      return enrollment.id === enrollmentId;
    });
  }

  function getStep(stepIndex) {
    return state.sequenceSteps[stepIndex - 1] || null;
  }

  function getCampaignById(campaignId) {
    return state.campaignRegistry.find(function find(campaign) {
      return campaign.id === campaignId;
    });
  }

  // Selectors & Derived State
  function getStatusCampaignId() {
    var preferred = state.ui.selectedStatusCampaignId;
    if (!preferred) {
      return null;
    }
    return getCampaignById(preferred) ? preferred : null;
  }

  function isViewingCurrentStatusCampaign() {
    var statusCampaignId = getStatusCampaignId();
    return !!statusCampaignId && statusCampaignId === state.campaign.id;
  }

  function isCampaignSetupLocked() {
    return state.campaign.status === STATUS.ACTIVE || state.campaign.status === STATUS.STOPPED;
  }

  function isCampaignManageableStatus(status) {
    return status === STATUS.ACTIVE || status === STATUS.STOPPED;
  }

  function getStatusCampaign() {
    var campaignId = getStatusCampaignId();
    if (!campaignId) {
      return null;
    }
    return getCampaignById(campaignId) || null;
  }

  function getStatusCampaignEnrollments() {
    var campaignId = getStatusCampaignId();
    if (!campaignId) {
      return [];
    }
    if (campaignId === state.campaign.id) {
      return state.enrollments;
    }

    var scoped = state.campaignEnrollments[campaignId];
    return Array.isArray(scoped) ? scoped : [];
  }

  function getCampaignEnrollments(campaignId) {
    if (campaignId === state.campaign.id) {
      return state.enrollments;
    }
    if (!Array.isArray(state.campaignEnrollments[campaignId])) {
      state.campaignEnrollments[campaignId] = [];
    }
    return state.campaignEnrollments[campaignId];
  }

  function getCampaignEnrollment(campaignId, enrollmentId) {
    var scoped = getCampaignEnrollments(campaignId);
    return scoped.find(function findEnrollment(enrollment) {
      return enrollment.id === enrollmentId;
    });
  }

  function syncStatusViewMode() {
    var statusCampaignId = getStatusCampaignId();
    state.ui.statusViewMode =
      !!statusCampaignId &&
      statusCampaignId === state.campaign.id &&
      isCampaignManageableStatus(state.campaign.status)
        ? "manage"
        : "review";
  }

  function clearRemoveUndoWindow() {
    if (removeUndoTimer) {
      clearTimeout(removeUndoTimer);
      removeUndoTimer = null;
    }
    state.ui.removeUndo = {
      enrollmentId: null,
      expiresAt: null,
      snapshot: null
    };
  }

  function startRemoveUndoWindow(enrollment, snapshot) {
    clearRemoveUndoWindow();

    state.ui.removeUndo = {
      enrollmentId: enrollment.id,
      expiresAt: new Date(Date.now() + REMOVE_UNDO_MS).toISOString(),
      snapshot: deepClone(snapshot)
    };

    removeUndoTimer = setTimeout(function expireUndo() {
      clearRemoveUndoWindow();
      render();
    }, REMOVE_UNDO_MS);
  }

  function getRemoveUndoRemainingSeconds() {
    if (!state.ui.removeUndo || !state.ui.removeUndo.expiresAt) {
      return 0;
    }
    var expiresAt = new Date(state.ui.removeUndo.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return 0;
    }
    var diff = expiresAt - Date.now();
    if (diff <= 0) {
      return 0;
    }
    return Math.ceil(diff / 1000);
  }

  function getCurrentCampaignSnapshot() {
    return {
      id: state.campaign.id,
      name: state.campaign.name,
      timezone: state.campaign.timezone,
      sendWindowStart: state.campaign.sendWindowStart,
      sendWindowEnd: state.campaign.sendWindowEnd,
      startDate: state.campaign.startDate || null,
      status: state.campaign.status,
      startedAt: state.campaign.startedAt || null
    };
  }

  function syncCampaignRegistry() {
    var snapshot = getCurrentCampaignSnapshot();
    var index = state.campaignRegistry.findIndex(function find(campaign) {
      return campaign.id === snapshot.id;
    });

    if (index === -1) {
      state.campaignRegistry.unshift(snapshot);
      return;
    }

    state.campaignRegistry[index] = Object.assign({}, state.campaignRegistry[index], snapshot);

    if (!state.campaignEnrollments[snapshot.id]) {
      state.campaignEnrollments[snapshot.id] = [];
    }
    state.campaignEnrollments[snapshot.id] = deepClone(state.enrollments);
  }

  function getStatusBadge(status) {
    if (status === STATUS.ACTIVE) {
      return '<span class="badge badge-active">ACTIVE</span>';
    }
    if (status === STATUS.RESPONDED) {
      return '<span class="badge badge-responded">RESPONDED</span>';
    }
    if (status === STATUS.STOPPED) {
      return '<span class="badge badge-stopped">STOPPED</span>';
    }
    if (status === STATUS.COMPLETED) {
      return '<span class="badge badge-completed">COMPLETED</span>';
    }
    if (status === STATUS.MANUALLY_REMOVED) {
      return '<span class="badge badge-removed">MANUALLY REMOVED</span>';
    }
    if (status === STATUS.SUPPRESSED) {
      return '<span class="badge badge-suppressed">SUPPRESSED</span>';
    }
    if (status === STATUS.APPROVED) {
      return '<span class="badge badge-approved">APPROVED</span>';
    }
    return '<span class="badge badge-ineligible">DRAFT</span>';
  }

  function getOperationalStatus(status) {
    if (status === STATUS.ACTIVE || status === STATUS.STOPPED || status === STATUS.COMPLETED) {
      return status;
    }
    return STATUS.STOPPED;
  }

  function getContactOperationalStatus(status) {
    return status === STATUS.ACTIVE ? STATUS.ACTIVE : STATUS.STOPPED;
  }

  function parseSendWindowHour() {
    if (!state.campaign.sendWindowStart) {
      return { hour: 9, minute: 0 };
    }
    var split = state.campaign.sendWindowStart.split(":");
    var hour = Number(split[0]);
    var minute = Number(split[1]);
    if (!Number.isFinite(hour)) {
      hour = 9;
    }
    if (!Number.isFinite(minute)) {
      minute = 0;
    }
    return { hour: hour, minute: minute };
  }

  function computeDateForTriggerDay(triggerDay) {
    if (!state.campaign.startedAt) {
      return null;
    }
    var base = new Date(state.campaign.startedAt);
    var windowTime = parseSendWindowHour();
    var date = new Date(base);
    date.setDate(base.getDate() + triggerDay);
    date.setHours(windowTime.hour, windowTime.minute, 0, 0);
    return date;
  }

  function toLocaleLabelWithTimezone(dateValue, timezone) {
    if (!dateValue) {
      return "-";
    }
    var date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || "UTC"
    });
  }

  function toLocaleLabel(dateValue) {
    return toLocaleLabelWithTimezone(dateValue, state.campaign.timezone || "UTC");
  }

  function renderTemplate(text, contact) {
    var firstName = contact.name.split(" ")[0] || "there";
    var domain = contact.email.split("@")[1] || "your team";
    var company = domain.split(".")[0] || "your company";
    var painPoint = (contact.notes || "workflow friction")
      .split(".")[0]
      .trim()
      .toLowerCase();
    var notesContext = buildContactNotesContext(contact);

    return String(text || "")
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company)
      .replace(/\{\{pain_point\}\}/g, painPoint || "workflow friction")
      .replace(/\{\{notes_context\}\}/g, notesContext);
  }

  function buildContactNotesContext(contact) {
    var note = String((contact && contact.notes) || "workflow friction").trim();
    var firstSentence = note.split(".")[0].trim() || note;
    return firstSentence || "workflow friction";
  }

  function getStepByIndex(stepIndex) {
    return state.sequenceSteps.find(function match(step) {
      return step.stepIndex === stepIndex;
    });
  }

  function getSelectedEligibleContactsForPreview() {
    return getSelectedEligibleContacts();
  }

  function getExamplePreviewContact(stepIndex) {
    var selected = getSelectedEligibleContactsForPreview();
    if (!selected.length) {
      return null;
    }

    var existingId = state.ui.sequencePreview.exampleContactIdByStep[stepIndex];
    var found = selected.find(function match(contact) {
      return contact.id === existingId;
    });
    if (found) {
      return found;
    }

    var first = selected[0];
    state.ui.sequencePreview.exampleContactIdByStep[stepIndex] = first.id;
    return first;
  }

  function markStepDraftsStale(stepIndex) {
    state.draftApprovalItems.forEach(function mark(draft) {
      if (draft.stepIndex === stepIndex && draft.approvalStatus !== "sent") {
        draft.isStale = true;
        draft.updatedAt = new Date().toISOString();
      }
    });
  }

  function deriveAutomaticSubjectFromBody(body) {
    var compact = String(body || "")
      .replace(/\{\{first_name\}\}/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!compact) {
      return "Quick idea for {{company}}";
    }
    var sentence = compact.split(".")[0].trim();
    var cleaned = sentence.replace(/^hi[, ]*/i, "").replace(/^hey[, ]*/i, "").trim();
    var clipped = cleaned.slice(0, 64).trim();
    return (clipped || "Quick idea for {{company}}") + (clipped.length >= 64 ? "…" : "");
  }

  function buildPersonalizedTemplateFromPrompt(step, prompt) {
    var basePrompt = String(prompt || "").trim().toLowerCase();
    var hasFollowUp = basePrompt.indexOf("follow") !== -1;
    var hasUrgent = basePrompt.indexOf("urgent") !== -1 || basePrompt.indexOf("priority") !== -1;
    var opener = hasFollowUp
      ? "Quick follow-up based on your notes context around {{notes_context}}."
      : "Sharing a personalized note based on your context around {{notes_context}}.";
    var cta = hasUrgent
      ? "If this is still a priority, I can share a focused rollout plan for {{company}} this week."
      : "If helpful, I can share a concise next step tailored for {{company}}.";

    var body =
      "Hi {{first_name}},\n\n" +
      opener +
      "\n\n" +
      "Given that {{pain_point}} is top of mind, this email is tailored for {{company}} and your current workflow.\n\n" +
      cta;
    var subject = deriveAutomaticSubjectFromBody(body);

    return {
      subject: subject,
      body: body,
      notesSignals: ["notes_context", "pain_point", "company"]
    };
  }

  function renderExamplePreview(stepIndex, contactId) {
    var step = getStepByIndex(stepIndex);
    if (!step) {
      return;
    }

    var selected = getSelectedEligibleContactsForPreview();
    var contact = selected.find(function find(item) {
      return item.id === contactId;
    });
    if (!contact && selected.length) {
      contact = selected[0];
      state.ui.sequencePreview.exampleContactIdByStep[stepIndex] = contact.id;
    }
    if (!contact) {
      state.ui.sequencePreview.exampleSubjectByStep[stepIndex] = "";
      state.ui.sequencePreview.exampleBodyByStep[stepIndex] = "";
      state.ui.sequencePreview.lastPreviewedAtByStep[stepIndex] = null;
      return;
    }

    state.ui.sequencePreview.exampleSubjectByStep[stepIndex] = renderTemplate(getStepSubjectTemplate(step), contact);
    state.ui.sequencePreview.exampleBodyByStep[stepIndex] = renderTemplate(getStepBodyTemplate(step), contact);
    state.ui.sequencePreview.lastPreviewedAtByStep[stepIndex] = new Date().toISOString();
  }

  function getAvailableSources() {
    var map = {};
    state.contacts.forEach(function store(contact) {
      var source = contact.source || "Unknown";
      map[source] = true;
    });
    return Object.keys(map).sort();
  }

  function getFilteredContacts() {
    var field = String(state.ui.contactFilterField || "name");
    var textValue = String(state.ui.contactFilterValue || "").trim().toLowerCase();
    var sourceValue = String(state.ui.contactFilterSource || "").trim().toLowerCase();
    var statusValue = String(state.ui.contactFilterStatus || "").trim().toLowerCase();
    var globalSearch = String(state.ui.sourceSearch || "").trim().toLowerCase();

    return state.contacts.filter(function match(contact) {
      var source = String(contact.source || "Unknown").toLowerCase();
      var status = contact.suppressed ? "suppressed" : contact.eligible ? "eligible" : "ineligible";
      var globalHaystack = (
        String(contact.name || "") +
        " " +
        String(contact.email || "") +
        " " +
        String(contact.source || "") +
        " " +
        String(contact.notes || "")
      ).toLowerCase();

      if (globalSearch && globalHaystack.indexOf(globalSearch) === -1) {
        return false;
      }

      if (field === "source") {
        if (!sourceValue) {
          return true;
        }
        return source.indexOf(sourceValue) !== -1;
      }

      if (field === "status") {
        if (!statusValue) {
          return true;
        }
        return status === statusValue;
      }

      if (!textValue) {
        return true;
      }

      if (field === "email") {
        return String(contact.email || "")
          .toLowerCase()
          .indexOf(textValue) !== -1;
      }

      return String(contact.name || "")
        .toLowerCase()
        .indexOf(textValue) !== -1;
    });
  }

  function getVisibleEligibleContacts() {
    return getFilteredContacts().filter(function eligible(contact) {
      return contact.eligible && !contact.suppressed;
    });
  }

  function getSelectedEligibleContacts() {
    return state.contacts.filter(function selected(contact) {
      return !!state.selectedContactIds[contact.id] && contact.eligible && !contact.suppressed;
    });
  }

  function canContinueAudienceStep1() {
    return getSelectedEligibleContacts().length > 0;
  }

  function validateCampaignSetup() {
    var errors = {};
    var name = String(state.campaign.name || "").trim();
    var timezone = String(state.campaign.timezone || "").trim();
    var sendStart = String(state.campaign.sendWindowStart || "").trim();
    var sendEnd = String(state.campaign.sendWindowEnd || "").trim();
    var startDate = String(state.campaign.startDate || "").trim();

    if (!name) {
      errors.campaignName = "Campaign name is required.";
    }
    if (!timezone) {
      errors.timezone = "Timezone is required.";
    }
    if (!sendStart || !sendEnd) {
      errors.sendWindow = "Send window start and end are required.";
    } else if (sendStart >= sendEnd) {
      errors.sendWindow = "Send window start must be earlier than end.";
    }
    if (!startDate) {
      errors.startDate = "Start date is required.";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors: errors
    };
  }

  function isAudienceComplete() {
    return canContinueAudienceStep1() && validateCampaignSetup().isValid;
  }

  function getAudienceContactSummary() {
    var selected = getSelectedEligibleContacts();
    var bySource = {};
    selected.forEach(function count(contact) {
      var source = contact.source || "Unknown";
      bySource[source] = (bySource[source] || 0) + 1;
    });
    var sourceSummary = Object.keys(bySource)
      .sort()
      .map(function map(source) {
        return source + " (" + bySource[source] + ")";
      })
      .join(", ");
    return {
      selectedCount: selected.length,
      sourceSummary: sourceSummary || "None"
    };
  }

  function getAudienceCampaignSummary() {
    return {
      name: String(state.campaign.name || "").trim() || "Untitled campaign",
      timezone: String(state.campaign.timezone || "").trim() || "Not set",
      sendWindow:
        String(state.campaign.sendWindowStart || "").trim() && String(state.campaign.sendWindowEnd || "").trim()
          ? String(state.campaign.sendWindowStart) + " - " + String(state.campaign.sendWindowEnd)
          : "Not set",
      startDate: String(state.campaign.startDate || "").trim() || "Not set"
    };
  }

  function computeSelectVisibleState() {
    var visible = getVisibleEligibleContacts();
    if (!visible.length) {
      return "none";
    }
    var selected = visible.filter(function selected(contact) {
      return !!state.selectedContactIds[contact.id];
    }).length;
    if (!selected) {
      return "none";
    }
    if (selected === visible.length) {
      return "all";
    }
    return "partial";
  }

  function getSequenceValidation() {
    var globalErrors = [];
    var byStep = {};

    if (!state.sequenceSteps.length) {
      globalErrors.push("Add at least one sequence step.");
    }

    if (state.sequenceSteps.length > MAX_SEQUENCE_STEPS) {
      globalErrors.push("Sequence supports a maximum of 10 steps.");
    }

    var previousDay = null;

    state.sequenceSteps.forEach(function validate(step, index) {
      var stepErrors = {};
      var display = index + 1;

      if (!Number.isInteger(step.triggerDay)) {
        stepErrors.triggerDay = "Trigger day must be an integer.";
      } else if (step.triggerDay < 0) {
        stepErrors.triggerDay = "Trigger day must be 0 or greater.";
      }

      if (
        previousDay !== null &&
        Number.isInteger(previousDay) &&
        Number.isInteger(step.triggerDay) &&
        step.triggerDay <= previousDay
      ) {
        stepErrors.triggerDay = "Trigger day must be strictly greater than previous step.";
      }

      if (!String(getStepSubjectTemplate(step) || "").trim()) {
        stepErrors.subject = "Subject cannot be empty.";
      }

      if (!String(getStepBodyTemplate(step) || "").trim()) {
        stepErrors.body = "Body cannot be empty.";
      }

      if (step.composeMode === COMPOSE_MODE.PERSONALIZED && !String(step.personalizationPrompt || "").trim()) {
        stepErrors.personalizationPrompt = "Personalization instructions are required in personalized mode.";
      }

      if (Object.keys(stepErrors).length) {
        byStep[display] = stepErrors;
      }

      previousDay = step.triggerDay;
    });

    return {
      globalErrors: globalErrors,
      byStep: byStep,
      isValid: globalErrors.length === 0 && Object.keys(byStep).length === 0
    };
  }

  function getStepCompletion() {
    var audienceComplete = isAudienceComplete();
    var sequenceComplete = getSequenceValidation().isValid;
    var approvalComplete = isCampaignManageableStatus(state.campaign.status);

    return {
      audience: audienceComplete,
      sequence: sequenceComplete,
      approval: approvalComplete
    };
  }

  function syncWorkflowStatus() {
    var completion = getStepCompletion();

    state.ui.workflowStepStatus.audience = "ready";
    state.ui.workflowStepStatus.sequence = completion.audience ? "ready" : "locked";
    state.ui.workflowStepStatus.approval = completion.audience && completion.sequence ? "ready" : "locked";

    if (completion.audience) {
      state.ui.workflowStepStatus.audience = "complete";
    }
    if (completion.sequence) {
      state.ui.workflowStepStatus.sequence = "complete";
    }
    if (state.ui.campaignApproval.approved && state.campaign.status !== STATUS.ACTIVE) {
      state.ui.workflowStepStatus.approval = "complete";
    }
    if (completion.approval) {
      state.ui.workflowStepStatus.approval = "complete";
    }

    state.ui.selectVisibleState = computeSelectVisibleState();
    state.ui.sequenceValidationByStep = getSequenceValidation().byStep;
  }

  function isStepCompletedForNavigation(stepId) {
    var completion = getStepCompletion();
    if (stepId === "audience") {
      return completion.audience;
    }
    if (stepId === "sequence") {
      return completion.sequence;
    }
    return completion.approval;
  }

  function canNavigateTo(stepId) {
    if (stepId === STATUS_SCREEN.id) {
      return true;
    }

    var targetIndex = SCREENS.findIndex(function find(screen) {
      return screen.id === stepId;
    });
    if (targetIndex === -1) {
      return false;
    }

    if (state.activeScreen === STATUS_SCREEN.id) {
      if (targetIndex === 0) {
        return true;
      }
      var pre = 0;
      while (pre < targetIndex) {
        if (!isStepCompletedForNavigation(SCREENS[pre].id)) {
          return false;
        }
        pre += 1;
      }
      return true;
    }

    var activeIndex = SCREENS.findIndex(function find(screen) {
      return screen.id === state.activeScreen;
    });
    if (activeIndex === -1) {
      return false;
    }

    if (targetIndex <= activeIndex) {
      return true;
    }

    var idx = 0;
    while (idx < targetIndex) {
      if (!isStepCompletedForNavigation(SCREENS[idx].id)) {
        return false;
      }
      idx += 1;
    }
    return true;
  }

  function getNavigationLockReason(stepId) {
    if (stepId === "sequence" && !isAudienceComplete()) {
      return "Complete Audience Steps 1 and 2 before Sequence.";
    }
    if (stepId === "approval" && !getSequenceValidation().isValid) {
      return "Fix sequence validation errors before Campaign Approval.";
    }
    return "Complete previous step first.";
  }

  function invalidateCampaignApproval(reason) {
    if (isCampaignSetupLocked()) {
      return;
    }

    if (state.ui.campaignApproval.approved) {
      state.ui.campaignApproval.approved = false;
      state.ui.campaignApproval.approvedAt = null;
      state.ui.campaignApproval.approvedBy = null;
      state.ui.approvalInvalidatedReason = reason;
      state.campaign.status = STATUS.DRAFT;
      setNotice("alert", "Campaign approval was cleared: " + reason);
    }
  }

  function syncDraftStatusFlag() {
    if (isCampaignSetupLocked()) {
      return;
    }

    var completion = getStepCompletion();
    if (completion.audience && completion.sequence) {
      if (!state.ui.campaignApproval.approved) {
        state.campaign.status = STATUS.DRAFT;
      }
    } else {
      if (!state.ui.campaignApproval.approved) {
        state.campaign.status = STATUS.DRAFT;
      }
    }
  }

  function recordEvent(type, enrollment, extra) {
    var payload = extra || {};
    var payloadMeta = payload.meta || {};
    var campaignId =
      (enrollment && enrollment.campaignId) || payload.campaignId || payloadMeta.campaignId || state.campaign.id;
    state.events.unshift({
      id: nextId("evt"),
      type: type,
      campaignId: campaignId,
      contactId: enrollment ? enrollment.contactId : payload.contactId || null,
      stepIndex: payload.stepIndex || (enrollment ? enrollment.lastSentStep : null) || null,
      timestamp: new Date().toISOString(),
      meta: Object.assign({}, payloadMeta, {
        campaignId: payloadMeta.campaignId || campaignId
      })
    });
  }

  function syncEnrollmentSchedule(enrollment) {
    if (enrollment.status !== STATUS.ACTIVE) {
      enrollment.nextSendDay = null;
      enrollment.nextSendAt = null;
      return;
    }

    var step = getStep(enrollment.currentStep);
    if (!step) {
      enrollment.status = STATUS.COMPLETED;
      enrollment.nextSendDay = null;
      enrollment.nextSendAt = null;
      return;
    }

    enrollment.nextSendDay = step.triggerDay;
    var nextAt = computeDateForTriggerDay(step.triggerDay);
    enrollment.nextSendAt = nextAt ? nextAt.toISOString() : null;
  }

  // Domain Actions & Mutations
  function createDraft(enrollment, step) {
    var contact = getContact(enrollment.contactId);
    var subject = renderTemplate(getStepSubjectTemplate(step), contact);
    var body = renderTemplate(getStepBodyTemplate(step), contact);
    var notesContext = buildContactNotesContext(contact);

    var draft = {
      id: nextId("drf"),
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      stepIndex: step.stepIndex,
      sourceMode: step.composeMode || COMPOSE_MODE.GENERIC,
      isStale: false,
      subjectDraft: subject,
      bodyDraft: body + "\n\nPersonalized notes context: " + notesContext + "\n\nGenerated in mock mode for review.",
      approvalStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.draftApprovalItems.unshift(draft);
    return draft;
  }

  function findDraft(enrollmentId, stepIndex) {
    return state.draftApprovalItems.find(function find(item) {
      return item.enrollmentId === enrollmentId && item.stepIndex === stepIndex && !item.isStale;
    });
  }

  function getDuePendingDrafts() {
    return state.draftApprovalItems.filter(function due(draft) {
      if (draft.approvalStatus !== "pending" || draft.isStale) {
        return false;
      }
      var enrollment = getEnrollment(draft.enrollmentId);
      if (!enrollment || enrollment.status !== STATUS.ACTIVE) {
        return false;
      }
      var step = getStep(draft.stepIndex);
      return !!step && step.triggerDay <= state.simulationDay;
    });
  }

  function executeSend(enrollment, step) {
    enrollment.lastSentStep = step.stepIndex;
    enrollment.threadState = "Awaiting reply";
    recordEvent("send", enrollment, { stepIndex: step.stepIndex });

    if (enrollment.currentStep >= state.sequenceSteps.length) {
      enrollment.status = STATUS.COMPLETED;
      enrollment.nextSendDay = null;
      enrollment.nextSendAt = null;
      enrollment.currentStep = state.sequenceSteps.length;
      enrollment.threadState = "Completed without response";
      return;
    }

    enrollment.currentStep += 1;
    syncEnrollmentSchedule(enrollment);
  }

  function focusStepField(stepIndex, field) {
    var selector = field === "body" ? '[data-step-body="' + stepIndex + '"]' : '[data-step-subject="' + stepIndex + '"]';
    var element = document.querySelector(selector);
    if (element && typeof element.focus === "function") {
      element.focus();
      if (typeof element.select === "function" && field === "subject") {
        element.select();
      }
    }
  }

  function selectAllVisibleEligible() {
    if (isCampaignSetupLocked()) {
      setNotice("error", "Campaign has started; audience setup is locked.");
      render();
      return;
    }

    var visible = getVisibleEligibleContacts();
    visible.forEach(function select(contact) {
      state.selectedContactIds[contact.id] = true;
    });

    invalidateCampaignApproval("Audience selection changed.");
    syncDraftStatusFlag();
    render();
  }

  function clearVisibleSelection() {
    if (isCampaignSetupLocked()) {
      setNotice("error", "Campaign has started; audience setup is locked.");
      render();
      return;
    }

    var visible = getFilteredContacts();
    visible.forEach(function clear(contact) {
      state.selectedContactIds[contact.id] = false;
    });

    invalidateCampaignApproval("Audience selection changed.");
    syncDraftStatusFlag();
    render();
  }

  function openStartCampaignModal(triggerElement) {
    var completion = getStepCompletion();
    if (!completion.audience || !completion.sequence) {
      setNotice("error", "Complete Audience and Sequence before starting campaign.");
      render();
      return;
    }

    if (isCampaignSetupLocked()) {
      activateScreen("status");
      setNotice(
        "alert",
        state.campaign.status === STATUS.STOPPED
          ? "Campaign is stopped. Resume it from Campaigns Hub."
          : "Campaign is already active."
      );
      render();
      return;
    }

    lastFocusedElement = triggerElement || document.activeElement;
    state.ui.lastFocusedActionId = triggerElement ? triggerElement.id || null : null;
    state.ui.startCampaignConfirmOpen = true;
    render();

    var confirmButton = document.querySelector('[data-action="confirm-start-campaign"]');
    if (confirmButton && typeof confirmButton.focus === "function") {
      confirmButton.focus();
    }
  }

  function confirmStartCampaign() {
    state.ui.startCampaignConfirmOpen = false;
    startCampaignFromApproval();
  }

  function startCampaignFromApproval() {
    state.ui.campaignApproval.approved = true;
    state.ui.campaignApproval.approvedAt = new Date().toISOString();
    state.ui.campaignApproval.approvedBy = APPROVAL_ACTOR;
    state.ui.approvalInvalidatedReason = null;

    if (isCampaignSetupLocked()) {
      activateScreen("status");
      setNotice(
        "alert",
        state.campaign.status === STATUS.STOPPED
          ? "Campaign is stopped. Resume it from Campaigns Hub."
          : "Campaign is already active."
      );
      render();
      return;
    }

    state.campaign.status = STATUS.ACTIVE;

    var launchDate = new Date();
    if (state.campaign.startDate) {
      var parts = String(state.campaign.startDate).split("-");
      var year = Number(parts[0]);
      var month = Number(parts[1]);
      var day = Number(parts[2]);
      var sendWindow = parseSendWindowHour();
      var configured = new Date(year, month - 1, day, sendWindow.hour, sendWindow.minute, 0, 0);
      if (!Number.isNaN(configured.getTime())) {
        launchDate = configured;
      }
    }

    state.campaign.startedAt = launchDate.toISOString();
    state.simulationDay = 0;

    var selected = getSelectedEligibleContacts();
    state.enrollments = selected.map(function mapEnrollment(contact) {
      var enrollment = {
        id: nextId("enr"),
        campaignId: state.campaign.id,
        contactId: contact.id,
        status: STATUS.ACTIVE,
        stoppedByCampaign: false,
        currentStep: 1,
        nextSendDay: null,
        nextSendAt: null,
        gmailThreadId: "thread_" + contact.id,
        threadState: "Not sent yet",
        lastSentStep: 0,
        removedReason: null,
        removedBy: null,
        removedAt: null
      };
      syncEnrollmentSchedule(enrollment);
      return enrollment;
    });
    state.campaignEnrollments[state.campaign.id] = deepClone(state.enrollments);
    state.ui.selectedStatusCampaignId = null;
    state.ui.statusJourneyStep = 1;
    resetStatusJourneyVisited();
    state.ui.activityFilterAction = "all";
    state.ui.activitySortBy = "time";
    state.ui.activitySortDir = "desc";
    state.ui.activityPage = 1;
    state.ui.activityPageSize = 50;

    state.events = [];
    state.draftApprovalItems = [];
    state.ui.bulkActionConfirmOpen = false;
    clearRemoveUndoWindow();
    syncStatusViewMode();
    activateScreen("status");
    setNotice("alert", "Campaign started with " + selected.length + " contacts.");
    render();
  }

  function saveSequence() {
    if (isCampaignSetupLocked()) {
      setNotice("error", "Campaign has started; sequence setup is locked.");
      render();
      return;
    }

    var validation = getSequenceValidation();
    if (!validation.isValid) {
      setNotice("error", "Fix sequence validation errors before saving.");
      render();
      return;
    }

    var now = new Date().toISOString();

    state.sequenceSteps.forEach(function normalize(step, idx) {
      state.sequenceSteps[idx] = normalizeSequenceStep(step, idx);
      state.sequenceSteps[idx].stepIndex = idx + 1;
      state.ui.lastSavedAtByStep[state.sequenceSteps[idx].stepIndex] = now;
    });

    state.enrollments.forEach(function refresh(enrollment) {
      if (enrollment.status === STATUS.ACTIVE) {
        if (enrollment.currentStep > state.sequenceSteps.length) {
          enrollment.status = STATUS.COMPLETED;
          enrollment.currentStep = state.sequenceSteps.length;
          enrollment.nextSendDay = null;
          enrollment.nextSendAt = null;
        } else {
          syncEnrollmentSchedule(enrollment);
        }
      }
    });

    state.draftApprovalItems = state.draftApprovalItems.filter(function keep(draft) {
      return draft.approvalStatus === "sent" || draft.stepIndex <= state.sequenceSteps.length;
    });

    syncDraftStatusFlag();
    setNotice("alert", "Sequence saved.");
    render();
  }

  function addStep() {
    if (isCampaignSetupLocked()) {
      setNotice("error", "Campaign has started; sequence setup is locked.");
      render();
      return;
    }

    if (state.sequenceSteps.length >= MAX_SEQUENCE_STEPS) {
      setNotice("error", "Maximum 10 steps reached.");
      render();
      return;
    }

    var last = state.sequenceSteps[state.sequenceSteps.length - 1];
    var nextDay = last && Number.isInteger(last.triggerDay) ? last.triggerDay + 2 : 0;

    state.sequenceSteps.push({
      stepIndex: state.sequenceSteps.length + 1,
      triggerDay: nextDay,
      composeMode: COMPOSE_MODE.GENERIC,
      genericSubjectTemplate: "Step " + String(state.sequenceSteps.length + 1) + " follow-up",
      genericBodyTemplate: "Quick follow-up based on your previous context.",
      personalizationPrompt:
        "Rewrite this step as a personalized outreach email using recipient notes context and clear next-step CTA.",
      lastGeneratedAt: null,
      generationMeta: null
    });

    state.ui.expandedStepIndex = state.sequenceSteps.length;
    invalidateCampaignApproval("Sequence changed.");
    syncDraftStatusFlag();
    render();
  }

  function removeStep(stepIndex) {
    if (isCampaignSetupLocked()) {
      setNotice("error", "Campaign has started; sequence setup is locked.");
      render();
      return;
    }

    if (state.sequenceSteps.length <= 1) {
      setNotice("error", "At least one step is required.");
      render();
      return;
    }

    var position = stepIndex - 1;
    if (position < 0 || position >= state.sequenceSteps.length) {
      return;
    }

    state.sequenceSteps.splice(position, 1);
    state.sequenceSteps.forEach(function normalize(step, idx) {
      step.stepIndex = idx + 1;
      state.sequenceSteps[idx] = normalizeSequenceStep(step, idx);
    });
    state.ui.sequencePreview = {
      exampleContactIdByStep: {},
      exampleSubjectByStep: {},
      exampleBodyByStep: {},
      lastPreviewedAtByStep: {}
    };

    state.draftApprovalItems = state.draftApprovalItems.filter(function sentOnly(draft) {
      return draft.approvalStatus === "sent";
    });

    if (state.ui.expandedStepIndex && state.ui.expandedStepIndex > state.sequenceSteps.length) {
      state.ui.expandedStepIndex = state.sequenceSteps.length;
    }

    invalidateCampaignApproval("Sequence changed.");
    syncDraftStatusFlag();
    render();
  }

  function toggleStep(stepIndex) {
    state.ui.expandedStepIndex = state.ui.expandedStepIndex === stepIndex ? null : stepIndex;
    renderSequence();
  }

  function setStepComposeMode(stepIndex, mode) {
    if (isCampaignSetupLocked()) {
      setNotice("error", "Campaign has started; sequence setup is locked.");
      render();
      return;
    }

    var step = getStep(stepIndex);
    if (!step) {
      return;
    }

    var nextMode = mode === COMPOSE_MODE.PERSONALIZED ? COMPOSE_MODE.PERSONALIZED : COMPOSE_MODE.GENERIC;
    if (step.composeMode === nextMode) {
      return;
    }

    step.composeMode = nextMode;
    markStepDraftsStale(stepIndex);
    invalidateCampaignApproval("Sequence changed.");
    syncDraftStatusFlag();
    setNotice("alert", "Step " + stepIndex + " mode set to " + (nextMode === COMPOSE_MODE.PERSONALIZED ? "Personalized" : "Generic") + ".");
    render();
  }

  function generatePersonalizedTemplate(stepIndex) {
    if (isCampaignSetupLocked()) {
      setNotice("error", "Campaign has started; sequence setup is locked.");
      render();
      return;
    }

    var step = getStep(stepIndex);
    if (!step) {
      return;
    }
    if (step.composeMode !== COMPOSE_MODE.PERSONALIZED) {
      setNotice("error", "Set step mode to Personalized before generating.");
      render();
      return;
    }

    var now = new Date().toISOString();
    var generated = buildPersonalizedTemplateFromPrompt(step, step.personalizationPrompt);

    step.genericSubjectTemplate = generated.subject;
    step.genericBodyTemplate = generated.body;
    step.lastGeneratedAt = now;
    step.generationMeta = {
      rewrittenAt: now,
      strategy: "deterministic_personalization_mock",
      notesSignals: generated.notesSignals
    };
    state.ui.lastSavedAtByStep[stepIndex] = now;

    var previewContact = getExamplePreviewContact(stepIndex);
    renderExamplePreview(stepIndex, previewContact ? previewContact.id : null);

    markStepDraftsStale(stepIndex);

    invalidateCampaignApproval("Sequence changed.");
    syncDraftStatusFlag();
    setNotice("alert", "Step " + stepIndex + " personalized template generated.");
    render();
  }

  function runSendCycle() {
    if (!isViewingCurrentStatusCampaign()) {
      setNotice("error", "Switch to the selected active campaign before running send cycle.");
      render();
      return;
    }

    if (state.campaign.status !== STATUS.ACTIVE) {
      setNotice(
        "error",
        state.campaign.status === STATUS.STOPPED
          ? "Campaign is stopped. Resume campaign before running send cycle."
          : "Start campaign before running send cycle."
      );
      render();
      return;
    }

    var validation = getSequenceValidation();
    if (!validation.isValid) {
      setNotice("error", "Fix sequence validation errors before sending.");
      render();
      return;
    }

    var sendCount = 0;
    var pendingCount = 0;

    state.enrollments.forEach(function process(enrollment) {
      if (enrollment.status !== STATUS.ACTIVE) {
        return;
      }

      var step = getStep(enrollment.currentStep);
      if (!step) {
        enrollment.status = STATUS.COMPLETED;
        enrollment.nextSendDay = null;
        enrollment.nextSendAt = null;
        return;
      }

      if (step.triggerDay > state.simulationDay) {
        return;
      }

      var draft = findDraft(enrollment.id, step.stepIndex);
      if (!draft) {
        createDraft(enrollment, step);
        pendingCount += 1;
        return;
      }

      if (draft.isStale) {
        draft.approvalStatus = "rejected";
        draft.updatedAt = new Date().toISOString();
        createDraft(enrollment, step);
        pendingCount += 1;
        return;
      }

      if (draft.approvalStatus === "pending" || draft.approvalStatus === "rejected") {
        pendingCount += 1;
        return;
      }

      if (draft.approvalStatus === "approved") {
        draft.approvalStatus = "sent";
        draft.updatedAt = new Date().toISOString();
        executeSend(enrollment, step);
        sendCount += 1;
      }
    });

    if (!sendCount && !pendingCount) {
      setNotice("alert", "No due sends at current simulation day.");
    } else if (!sendCount && pendingCount) {
      setNotice("alert", "Awaiting approval for " + pendingCount + " due draft(s).");
    } else {
      setNotice(
        "alert",
        "Send cycle completed: " +
          sendCount +
          " sent." +
          (pendingCount ? " " + pendingCount + " draft(s) still pending." : "")
      );
    }

    render();
  }

  function advanceDay() {
    if (!isViewingCurrentStatusCampaign()) {
      setNotice("error", "Switch to the selected active campaign before advancing day.");
      render();
      return;
    }

    if (state.campaign.status !== STATUS.ACTIVE) {
      setNotice(
        "error",
        state.campaign.status === STATUS.STOPPED
          ? "Campaign is stopped. Resume campaign before advancing simulation day."
          : "Start campaign before advancing simulation day."
      );
      render();
      return;
    }

    state.simulationDay += 1;
    setNotice("alert", "Simulation moved to Day " + state.simulationDay + ".");
    render();
  }

  function simulateHumanReply(enrollmentId) {
    var enrollment = getEnrollment(enrollmentId);
    if (!enrollment) {
      return;
    }

    if (enrollment.status !== STATUS.ACTIVE && enrollment.status !== STATUS.COMPLETED) {
      setNotice("error", "Human reply simulation applies to active/completed threads.");
      render();
      return;
    }

    enrollment.status = STATUS.RESPONDED;
    enrollment.nextSendDay = null;
    enrollment.nextSendAt = null;
    enrollment.threadState = "Human reply received";

    var stepIndex = enrollment.lastSentStep || Math.max(1, enrollment.currentStep - 1);
    recordEvent("qualifying_reply", enrollment, { stepIndex: stepIndex });
    setNotice("alert", "Contact marked responded. Future sends stopped.");
    render();
  }

  function simulateOOOReply(enrollmentId) {
    var enrollment = getEnrollment(enrollmentId);
    if (!enrollment) {
      return;
    }

    if (enrollment.status !== STATUS.ACTIVE && enrollment.status !== STATUS.COMPLETED) {
      setNotice("error", "OOO simulation applies to active/completed threads.");
      render();
      return;
    }

    var stepIndex = enrollment.lastSentStep || Math.max(1, enrollment.currentStep - 1);
    recordEvent("ooo_reply", enrollment, { stepIndex: stepIndex });
    enrollment.threadState = "OOO ignored";
    setNotice("alert", "OOO reply logged and ignored.");
    render();
  }

  function setCampaignStatus(campaignId, targetStatus) {
    var campaign = getCampaignById(campaignId);
    if (!campaign) {
      setNotice("error", "Selected campaign was not found.");
      render();
      return;
    }

    var normalizedTarget = getOperationalStatus(targetStatus);
    var currentStatus = getOperationalStatus(campaign.status);
    if (currentStatus === normalizedTarget) {
      setNotice("alert", "Campaign is already " + normalizedTarget + ".");
      render();
      return;
    }

    var scopedEnrollments = getCampaignEnrollments(campaign.id);
    var changed = 0;

    if (normalizedTarget === STATUS.STOPPED) {
      scopedEnrollments.forEach(function pause(enrollment) {
        if (enrollment.status !== STATUS.ACTIVE) {
          return;
        }
        enrollment.status = STATUS.STOPPED;
        enrollment.stoppedByCampaign = true;
        enrollment.pausedNextSendDay = enrollment.nextSendDay;
        enrollment.pausedNextSendAt = enrollment.nextSendAt;
        enrollment.pausedThreadState = enrollment.threadState || "Awaiting reply";
        enrollment.nextSendDay = null;
        enrollment.nextSendAt = null;
        enrollment.threadState = "Campaign paused";
        changed += 1;
      });
    } else if (normalizedTarget === STATUS.ACTIVE) {
      scopedEnrollments.forEach(function resume(enrollment) {
        if (enrollment.status !== STATUS.STOPPED || !enrollment.stoppedByCampaign) {
          return;
        }
        enrollment.status = STATUS.ACTIVE;
        enrollment.stoppedByCampaign = false;
        enrollment.nextSendDay =
          enrollment.pausedNextSendDay === undefined ? enrollment.nextSendDay : enrollment.pausedNextSendDay;
        enrollment.nextSendAt = enrollment.pausedNextSendAt === undefined ? enrollment.nextSendAt : enrollment.pausedNextSendAt;
        enrollment.threadState = enrollment.pausedThreadState || "Campaign resumed";
        delete enrollment.pausedNextSendDay;
        delete enrollment.pausedNextSendAt;
        delete enrollment.pausedThreadState;
        if (campaign.id === state.campaign.id && enrollment.nextSendDay === null) {
          syncEnrollmentSchedule(enrollment);
        }
        changed += 1;
      });
    } else if (normalizedTarget === STATUS.COMPLETED) {
      scopedEnrollments.forEach(function complete(enrollment) {
        if (enrollment.status === STATUS.COMPLETED) {
          return;
        }
        if (enrollment.status === STATUS.MANUALLY_REMOVED || enrollment.status === STATUS.RESPONDED) {
          enrollment.status = STATUS.COMPLETED;
        } else if (enrollment.status === STATUS.ACTIVE || enrollment.status === STATUS.STOPPED) {
          enrollment.status = STATUS.COMPLETED;
        } else {
          enrollment.status = STATUS.COMPLETED;
        }
        enrollment.stoppedByCampaign = false;
        delete enrollment.pausedNextSendDay;
        delete enrollment.pausedNextSendAt;
        delete enrollment.pausedThreadState;
        enrollment.nextSendDay = null;
        enrollment.nextSendAt = null;
        enrollment.threadState = "Completed manually";
        changed += 1;
      });
    }

    campaign.status = normalizedTarget;
    if (campaign.id === state.campaign.id) {
      state.campaign.status = normalizedTarget;
    }

    recordEvent("campaign_status_changed", null, {
      contactId: null,
      meta: {
        campaignId: campaign.id,
        fromStatus: currentStatus,
        toStatus: normalizedTarget,
        changedContacts: changed,
        actor: APPROVAL_ACTOR
      }
    });

    setNotice("alert", "Campaign set to " + normalizedTarget + ". Updated contacts: " + changed + ".");
    render();
  }

  function setContactStatusInCampaign(campaignId, enrollmentId, targetStatus) {
    var campaign = getCampaignById(campaignId);
    if (!campaign) {
      setNotice("error", "Campaign not found for contact update.");
      render();
      return;
    }

    var enrollment = getCampaignEnrollment(campaignId, enrollmentId);
    if (!enrollment) {
      setNotice("error", "Contact enrollment not found in selected campaign.");
      render();
      return;
    }

    var normalizedTarget = getOperationalStatus(targetStatus);
    var currentStatus = getOperationalStatus(enrollment.status);
    if (currentStatus === normalizedTarget) {
      setNotice("alert", "Contact is already " + normalizedTarget + ".");
      render();
      return;
    }

    enrollment.status = normalizedTarget;
    enrollment.stoppedByCampaign = false;
    delete enrollment.pausedNextSendDay;
    delete enrollment.pausedNextSendAt;
    delete enrollment.pausedThreadState;

    if (normalizedTarget === STATUS.ACTIVE) {
      enrollment.removedReason = null;
      enrollment.removedBy = null;
      enrollment.removedAt = null;
      enrollment.threadState = "Resumed";
      if (campaignId === state.campaign.id) {
        syncEnrollmentSchedule(enrollment);
      }
    } else if (normalizedTarget === STATUS.STOPPED) {
      enrollment.nextSendDay = null;
      enrollment.nextSendAt = null;
      enrollment.threadState = "Stopped manually";
    } else if (normalizedTarget === STATUS.COMPLETED) {
      enrollment.nextSendDay = null;
      enrollment.nextSendAt = null;
      enrollment.threadState = "Completed manually";
    }

    recordEvent("contact_status_changed", enrollment, {
      stepIndex: enrollment.lastSentStep || Math.max(1, enrollment.currentStep - 1),
      meta: {
        campaignId: campaignId,
        fromStatus: currentStatus,
        toStatus: normalizedTarget,
        actor: APPROVAL_ACTOR
      }
    });

    setNotice("alert", "Contact status set to " + normalizedTarget + " for this campaign.");
    render();
  }

  function stopSelectedCampaign() {
    var campaignId = getStatusCampaignId();
    if (!campaignId) {
      setNotice("error", "Select a campaign first.");
      render();
      return;
    }
    setCampaignStatus(campaignId, STATUS.STOPPED);
  }

  function resumeSelectedCampaign() {
    var campaignId = getStatusCampaignId();
    if (!campaignId) {
      setNotice("error", "Select a campaign first.");
      render();
      return;
    }
    setCampaignStatus(campaignId, STATUS.ACTIVE);
  }

  function stopContactCampaign(enrollmentId) {
    var campaignId = getStatusCampaignId();
    if (!campaignId) {
      return;
    }
    setContactStatusInCampaign(campaignId, enrollmentId, STATUS.STOPPED);
  }

  function resumeStoppedContact(enrollmentId) {
    var campaignId = getStatusCampaignId();
    if (!campaignId) {
      return;
    }
    setContactStatusInCampaign(campaignId, enrollmentId, STATUS.ACTIVE);
  }

  function setApprovalFilter(value) {
    state.ui.approvalFilter = value;
    renderStatus();
  }

  function setStatusFilter(value) {
    state.ui.statusFilter = value;
    state.ui.hubContactsPage = 1;
    renderStatus();
  }

  function toggleCampaignDirectoryCollapsed() {
    state.ui.isCampaignDirectoryCollapsed = !state.ui.isCampaignDirectoryCollapsed;
    renderStatus();
  }

  function resetStatusJourneyVisited() {
    state.ui.statusJourneyVisited = {
      1: true,
      2: false,
      3: false,
      4: false
    };
  }

  function selectStatusCampaign(campaignId) {
    if (!campaignId || !getCampaignById(campaignId)) {
      setNotice("error", "Selected campaign was not found.");
      render();
      return;
    }

    var previousCampaignId = state.ui.selectedStatusCampaignId;
    state.ui.selectedStatusCampaignId = campaignId;
    resetStatusJourneyVisited();
    state.ui.statusJourneyStep = 2;
    state.ui.statusJourneyVisited[2] = true;
    state.ui.statusFilter = "all";
    state.ui.hubContactsPage = 1;
    state.ui.activityPage = 1;
    state.ui.isCampaignDirectoryCollapsed = true;
    syncStatusViewMode();
    if (previousCampaignId !== campaignId) {
      recordEvent("status_campaign_switched", null, {
        contactId: null,
        meta: {
          fromCampaignId: previousCampaignId || null,
          toCampaignId: campaignId
        }
      });
    }
    setNotice("alert", "Showing contacts for " + (getCampaignById(campaignId).name || campaignId) + ".");
    activateScreen("status", true);
  }

  function setStatusJourneyStep(step) {
    var nextStep = Number(step);
    if (!Number.isFinite(nextStep)) {
      return;
    }
    if (nextStep < 1) {
      nextStep = 1;
    }
    if (nextStep > 4) {
      nextStep = 4;
    }
    if (nextStep > 1 && !state.ui.selectedStatusCampaignId) {
      setNotice("error", "Select a campaign first.");
      render();
      return;
    }
    if (nextStep === 3 && !(state.ui.statusJourneyVisited && state.ui.statusJourneyVisited[2])) {
      setNotice("error", "Complete Step 2 before reviewing KPIs.");
      render();
      return;
    }
    if (nextStep === 4 && !(state.ui.statusJourneyVisited && state.ui.statusJourneyVisited[3])) {
      setNotice("error", "Complete Step 3 before reviewing activity.");
      render();
      return;
    }
    if (nextStep > 1) {
      state.ui.isCampaignDirectoryCollapsed = true;
    } else {
      state.ui.isCampaignDirectoryCollapsed = false;
    }
    state.ui.statusJourneyStep = nextStep;
    if (!state.ui.statusJourneyVisited || typeof state.ui.statusJourneyVisited !== "object") {
      resetStatusJourneyVisited();
    }
    state.ui.statusJourneyVisited[nextStep] = true;
    renderStatus();
  }

  function openBulkApprovalConfirm() {
    state.ui.bulkActionConfirmOpen = true;
    renderStatus();
  }

  function cancelBulkApprovalConfirm() {
    state.ui.bulkActionConfirmOpen = false;
    renderStatus();
  }

  function confirmBulkApprovalDue() {
    var due = getDuePendingDrafts();
    if (!due.length) {
      state.ui.bulkActionConfirmOpen = false;
      renderStatus();
      return;
    }

    due.forEach(function approve(draft) {
      draft.approvalStatus = "approved";
      draft.updatedAt = new Date().toISOString();
    });

    recordEvent("bulk_approve", null, {
      contactId: null,
      meta: {
        count: due.length,
        simulationDay: state.simulationDay
      }
    });

    state.ui.bulkActionConfirmOpen = false;
    setNotice("alert", "Approved " + due.length + " pending draft(s) due today.");
    render();
  }

  function approveDraft(draftId) {
    var draft = state.draftApprovalItems.find(function find(item) {
      return item.id === draftId;
    });
    if (!draft || draft.approvalStatus === "sent" || draft.isStale) {
      return;
    }

    draft.approvalStatus = "approved";
    draft.updatedAt = new Date().toISOString();
    setNotice("alert", "Draft approved.");
    render();
  }

  function rejectDraft(draftId) {
    var draft = state.draftApprovalItems.find(function find(item) {
      return item.id === draftId;
    });
    if (!draft || draft.approvalStatus === "sent" || draft.isStale) {
      return;
    }

    draft.approvalStatus = "rejected";
    draft.updatedAt = new Date().toISOString();
    setNotice("alert", "Draft rejected.");
    render();
  }

  function regenerateDraft(draftId) {
    var draft = state.draftApprovalItems.find(function find(item) {
      return item.id === draftId;
    });
    if (!draft || draft.approvalStatus === "sent" || draft.isStale) {
      return;
    }

    var enrollment = getEnrollment(draft.enrollmentId);
    var step = getStep(draft.stepIndex);
    var contact = enrollment ? getContact(enrollment.contactId) : null;
    if (!enrollment || !step || !contact) {
      return;
    }

    draft.subjectDraft = renderTemplate(getStepSubjectTemplate(step), contact) + " (refresh)";
    draft.bodyDraft =
      renderTemplate(getStepBodyTemplate(step), contact) +
      "\n\nContext from notes: " +
      contact.notes +
      "\n\nRegenerated in mock mode for review.";
    draft.isStale = false;
    draft.sourceMode = step.composeMode || COMPOSE_MODE.GENERIC;
    draft.approvalStatus = "pending";
    draft.updatedAt = new Date().toISOString();

    setNotice("alert", "Draft regenerated and moved to pending.");
    render();
  }

  function openRemoveModal(enrollmentId, triggerElement) {
    var enrollment = getEnrollment(enrollmentId);
    if (!enrollment || enrollment.status !== STATUS.ACTIVE) {
      setNotice("error", "Only active contacts can be removed.");
      render();
      return;
    }

    lastFocusedElement = triggerElement || document.activeElement;
    state.ui.lastFocusedActionId = triggerElement ? triggerElement.id || null : null;
    state.ui.removeModalTargetId = enrollmentId;
    state.ui.removeReason = "";
    render();

    var reasonField = document.getElementById("remove-reason");
    if (reasonField) {
      reasonField.focus();
    }
  }

  function openStatusChangeModal(scope, campaignId, enrollmentId, targetStatus, triggerElement) {
    if (!scope || !campaignId || !targetStatus) {
      return;
    }

    lastFocusedElement = triggerElement || document.activeElement;
    state.ui.lastFocusedActionId = triggerElement ? triggerElement.id || null : null;
    state.ui.statusChangeConfirm = {
      scope: scope,
      campaignId: campaignId,
      enrollmentId: enrollmentId || null,
      targetStatus: targetStatus
    };
    render();

    var confirmButton = document.querySelector('[data-action="confirm-status-change"]');
    if (confirmButton && typeof confirmButton.focus === "function") {
      confirmButton.focus();
    }
  }

  function clearStatusChangeModal() {
    state.ui.statusChangeConfirm = {
      scope: null,
      campaignId: null,
      enrollmentId: null,
      targetStatus: null
    };
  }

  function confirmStatusChange() {
    var pending = state.ui.statusChangeConfirm;
    if (!pending || !pending.scope || !pending.campaignId || !pending.targetStatus) {
      return;
    }

    var campaignId = pending.campaignId;
    var targetStatus = pending.targetStatus;
    var scope = pending.scope;
    var enrollmentId = pending.enrollmentId;

    clearStatusChangeModal();

    if (scope === "campaign") {
      setCampaignStatus(campaignId, targetStatus);
      return;
    }
    if (scope === "contact") {
      setContactStatusInCampaign(campaignId || getStatusCampaignId(), enrollmentId, targetStatus);
      return;
    }
  }

  function hasOpenModal() {
    return !!state.ui.removeModalTargetId || !!state.ui.statusChangeConfirm.scope || !!state.ui.startCampaignConfirmOpen;
  }

  function closeModal(restoreFocus) {
    var shouldRestore = restoreFocus !== false;
    var focusId = state.ui.lastFocusedActionId;

    state.ui.removeModalTargetId = null;
    state.ui.removeReason = "";
    state.ui.startCampaignConfirmOpen = false;
    clearStatusChangeModal();
    state.ui.lastFocusedActionId = null;
    render();

    if (!shouldRestore) {
      return;
    }

    if (focusId) {
      var target = document.getElementById(focusId);
      if (target && typeof target.focus === "function") {
        target.focus();
        lastFocusedElement = null;
        return;
      }
    }

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }

    lastFocusedElement = null;
  }

  function confirmRemoval() {
    var enrollment = getEnrollment(state.ui.removeModalTargetId);
    if (!enrollment) {
      closeModal(true);
      return;
    }

    var reason = String(state.ui.removeReason || "").trim();
    if (!reason) {
      setNotice("error", "Removal reason is required.");
      render();
      return;
    }

    var snapshot = deepClone(enrollment);
    enrollment.status = STATUS.MANUALLY_REMOVED;
    enrollment.removedReason = reason;
    enrollment.removedBy = APPROVAL_ACTOR;
    enrollment.removedAt = new Date().toISOString();
    enrollment.stoppedByCampaign = false;
    delete enrollment.pausedNextSendDay;
    delete enrollment.pausedNextSendAt;
    delete enrollment.pausedThreadState;
    enrollment.nextSendDay = null;
    enrollment.nextSendAt = null;
    enrollment.threadState = "Manually removed";

    recordEvent("removed", enrollment, {
      stepIndex: enrollment.lastSentStep || Math.max(1, enrollment.currentStep - 1),
      meta: {
        reason: reason,
        actor: APPROVAL_ACTOR
      }
    });

    startRemoveUndoWindow(enrollment, snapshot);
    setNotice("alert", "Contact removed from this campaign sequence. Undo is available for 10 seconds.");
    closeModal(false);
  }

  function undoRemoveContact() {
    var undoState = state.ui.removeUndo;
    if (!undoState || !undoState.enrollmentId || !undoState.snapshot) {
      return;
    }

    var enrollment = getEnrollment(undoState.enrollmentId);
    if (!enrollment) {
      clearRemoveUndoWindow();
      setNotice("error", "Undo window expired or contact no longer available.");
      render();
      return;
    }

    var snapshot = deepClone(undoState.snapshot);
    Object.keys(snapshot).forEach(function restore(key) {
      enrollment[key] = snapshot[key];
    });

    recordEvent("undo_remove", enrollment, {
      stepIndex: enrollment.lastSentStep || Math.max(1, enrollment.currentStep - 1),
      meta: {
        actor: APPROVAL_ACTOR
      }
    });

    clearRemoveUndoWindow();
    setNotice("alert", "Removal undone. Contact restored to previous state.");
    render();
  }

  function readdContact(enrollmentId) {
    var enrollment = getEnrollment(enrollmentId);
    if (!enrollment || enrollment.status !== STATUS.MANUALLY_REMOVED) {
      return;
    }

    var campaignStopped = state.campaign.status === STATUS.STOPPED;
    enrollment.status = campaignStopped ? STATUS.STOPPED : STATUS.ACTIVE;
    enrollment.removedReason = null;
    enrollment.removedBy = null;
    enrollment.removedAt = null;
    enrollment.stoppedByCampaign = campaignStopped;
    enrollment.threadState = campaignStopped ? "Campaign paused" : "Re-added";

    if (campaignStopped) {
      var step = getStep(enrollment.currentStep);
      enrollment.pausedNextSendDay = step ? step.triggerDay : null;
      var pausedAt = step ? computeDateForTriggerDay(step.triggerDay) : null;
      enrollment.pausedNextSendAt = pausedAt ? pausedAt.toISOString() : null;
      enrollment.pausedThreadState = "Re-added";
      enrollment.nextSendDay = null;
      enrollment.nextSendAt = null;
    } else {
      delete enrollment.pausedNextSendDay;
      delete enrollment.pausedNextSendAt;
      delete enrollment.pausedThreadState;
      syncEnrollmentSchedule(enrollment);
    }

    recordEvent("readded", enrollment, {
      stepIndex: enrollment.lastSentStep || Math.max(1, enrollment.currentStep - 1)
    });

    setNotice(
      "alert",
      campaignStopped
        ? "Contact re-added and kept paused because campaign is stopped."
        : "Contact re-added to sequence."
    );
    render();
  }

  function getContinueInfo(screenId) {
    if (screenId === "audience") {
      if (state.ui.audienceSubStep === 1) {
        var contactsReady = canContinueAudienceStep1();
        return {
          action: "audience-next-substep",
          label: "Continue to Campaign Setup",
          disabledReason: contactsReady ? "" : "Select at least one eligible contact to continue."
        };
      }

      var campaignValid = validateCampaignSetup();
      return {
        action: "continue-to-sequence",
        label: "Continue to Sequence",
        disabledReason: campaignValid.isValid ? "" : "Complete campaign setup fields before continuing."
      };
    }

    if (screenId === "sequence") {
      var valid = getSequenceValidation().isValid;
      return {
        action: "continue-to-approval",
        label: "Continue to Campaign Approval",
        disabledReason: valid ? "" : "Resolve sequence validation errors before continuing."
      };
    }

    if (screenId === "approval") {
      return null;
    }

    return null;
  }

  function renderStepFooter(screenId) {
    var index = SCREENS.findIndex(function find(screen) {
      return screen.id === screenId;
    });

    if (index === -1) {
      return "";
    }

    var backButton = "";
    if (index > 0) {
      var backTarget = SCREENS[index - 1].id;
      backButton =
        '<button class="btn btn-secondary" type="button" data-action="go-step" data-step-target="' +
        backTarget +
        '">Back</button>';
    }

    var continueInfo = getContinueInfo(screenId);
    var continueButton = "";
    var hint = "";
    if (continueInfo) {
      continueButton =
        '<button class="btn btn-primary" type="button" data-action="' +
        continueInfo.action +
        '"' +
        disabledAttr(continueInfo.disabledReason) +
        ">" +
        escapeHtml(continueInfo.label) +
        "</button>";
      hint = reasonHint(continueInfo.disabledReason);
    }

    return '<div class="step-footer">' + backButton + continueButton + "</div>" + hint;
  }

  function activateScreen(screenId, force) {
    var shouldForce = !!force;
    if (!shouldForce && !canNavigateTo(screenId)) {
      setNotice("error", getNavigationLockReason(screenId));
      renderAlert();
      return;
    }

    if (screenId === "audience" && state.activeScreen !== "audience" && isAudienceComplete()) {
      state.ui.audienceSubStep = 2;
      state.ui.audienceCollapsed.contacts = true;
      state.ui.audienceCollapsed.campaignSetup = true;
    }

    state.activeScreen = screenId;
    render();
  }

  function setAudienceSubStep(step, force) {
    var nextStep = Number(step);
    if (!Number.isFinite(nextStep)) {
      return;
    }
    if (nextStep < 1) {
      nextStep = 1;
    }
    if (nextStep > 2) {
      nextStep = 2;
    }

    if (!force && nextStep === 2 && !canContinueAudienceStep1()) {
      setNotice("error", "Select at least one eligible contact to continue.");
      render();
      return;
    }

    state.ui.audienceSubStep = nextStep;
    if (nextStep === 1) {
      state.ui.audienceCollapsed.contacts = false;
    } else {
      state.ui.audienceCollapsed.contacts = true;
      state.ui.audienceCollapsed.campaignSetup = false;
    }
    renderAudience();
    renderTabs();
    renderHeader();
    renderMobileTray();
  }

  function goNextFrom(screenId) {
    if (screenId === "audience") {
      if (state.ui.audienceSubStep === 1) {
        setAudienceSubStep(2, false);
        return;
      }
      state.ui.audienceCollapsed.contacts = true;
      state.ui.audienceCollapsed.campaignSetup = true;
      activateScreen("sequence");
      return;
    }
    if (screenId === "sequence") {
      activateScreen("approval");
    }
  }

  function goBackFrom(screenId) {
    if (screenId === "sequence") {
      activateScreen("audience", true);
      return;
    }
    if (screenId === "approval") {
      activateScreen("sequence", true);
    }
  }

  // UI Action Handlers
  function handleClick(event) {
    var tab = event.target.closest(".screen-tab[data-screen]");
    if (tab) {
      activateScreen(tab.getAttribute("data-screen"));
      return;
    }

    if (event.target.id === "reset-demo") {
      clearRemoveUndoWindow();
      state = buildInitialState();
      render();
      return;
    }

    var actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      return;
    }

    var action = actionEl.getAttribute("data-action");
    var stepIndex = Number(actionEl.getAttribute("data-step-index"));
    var enrollmentId = actionEl.getAttribute("data-enrollment-id");
    var draftId = actionEl.getAttribute("data-draft-id");
    var filterValue = actionEl.getAttribute("data-filter");
    var stepTarget = actionEl.getAttribute("data-step-target");
    var campaignId = actionEl.getAttribute("data-campaign-id");
    var statusStepTarget = Number(actionEl.getAttribute("data-step"));
    var activitySortBy = actionEl.getAttribute("data-sort-by");
    var activityPageTarget = Number(actionEl.getAttribute("data-page"));
    var actionHandlers = {
      "go-step": function goStep() {
        activateScreen(stepTarget, true);
      },
      "audience-next-substep": function audienceNextSubstep() {
        setAudienceSubStep(2, false);
      },
      "audience-prev-substep": function audiencePrevSubstep() {
        setAudienceSubStep(1, true);
      },
      "audience-edit-contacts": function audienceEditContacts() {
        state.ui.audienceCollapsed.contacts = false;
        state.ui.audienceSubStep = 1;
        renderAudience();
        renderHeader();
        renderMobileTray();
      },
      "audience-edit-campaign-setup": function audienceEditCampaignSetup() {
        state.ui.audienceCollapsed.campaignSetup = false;
        state.ui.audienceCollapsed.contacts = true;
        state.ui.audienceSubStep = 2;
        renderAudience();
        renderHeader();
        renderMobileTray();
      },
      "continue-to-sequence": function continueToSequence() {
        goNextFrom("audience");
      },
      "continue-to-approval": function continueToApproval() {
        goNextFrom("sequence");
      },
      "select-all-visible": function selectAllVisible() {
        selectAllVisibleEligible();
      },
      "clear-visible-selection": function clearVisibleSelectionAction() {
        clearVisibleSelection();
      },
      "clear-contact-filters": function clearContactFilters() {
        state.ui.contactFilterField = "name";
        state.ui.contactFilterValue = "";
        state.ui.contactFilterSource = "";
        state.ui.contactFilterStatus = "";
        state.ui.sourceSearch = "";
        state.ui.audienceContactsPage = 1;
        state.ui.isContactFilterMenuOpen = false;
        renderAudience();
      },
      "toggle-contact-filter-menu": function toggleContactFilterMenu() {
        state.ui.isContactFilterMenuOpen = !state.ui.isContactFilterMenuOpen;
        renderAudience();
      },
      "toggle-step": function toggleStepAction() {
        toggleStep(stepIndex);
      },
      "save-sequence": function saveSequenceAction() {
        saveSequence();
      },
      "add-step": function addStepAction() {
        addStep();
      },
      "remove-step": function removeStepAction() {
        removeStep(stepIndex);
      },
      "set-step-compose-mode": function setStepComposeModeAction() {
        setStepComposeMode(stepIndex, actionEl.getAttribute("data-compose-mode"));
      },
      "generate-personalized-template": function generatePersonalizedTemplateAction() {
        generatePersonalizedTemplate(stepIndex);
      },
      "start-campaign": function startCampaignAction() {
        openStartCampaignModal(actionEl);
      },
      "confirm-start-campaign": function confirmStartCampaignAction() {
        confirmStartCampaign();
      },
      "stop-campaign": function stopCampaignAction() {
        stopSelectedCampaign();
      },
      "resume-campaign": function resumeCampaignAction() {
        resumeSelectedCampaign();
      },
      "run-send-cycle": function runSendCycleAction() {
        runSendCycle();
      },
      "advance-day": function advanceDayAction() {
        advanceDay();
      },
      "set-approval-filter": function setApprovalFilterAction() {
        setApprovalFilter(filterValue);
      },
      "set-status-filter": function setStatusFilterAction() {
        setStatusFilter(filterValue);
      },
      "toggle-campaign-directory": function toggleCampaignDirectoryAction() {
        toggleCampaignDirectoryCollapsed();
      },
      "select-status-campaign": function selectStatusCampaignAction() {
        selectStatusCampaign(campaignId);
      },
      "status-next-step": function statusNextStepAction() {
        setStatusJourneyStep((state.ui.statusJourneyStep || 1) + 1);
      },
      "status-prev-step": function statusPrevStepAction() {
        setStatusJourneyStep((state.ui.statusJourneyStep || 1) - 1);
      },
      "status-go-all-campaigns": function statusGoAllCampaignsAction() {
        state.activeScreen = "status";
        state.ui.selectedStatusCampaignId = null;
        resetStatusJourneyVisited();
        state.ui.statusJourneyStep = 1;
        state.ui.statusFilter = "all";
        state.ui.hubContactsPage = 1;
        state.ui.isCampaignDirectoryCollapsed = false;
        state.ui.activityPage = 1;
        syncStatusViewMode();
        renderStatus();
      },
      "status-go-step": function statusGoStepAction() {
        if (!Number.isFinite(statusStepTarget)) {
          return;
        }
        setStatusJourneyStep(statusStepTarget);
      },
      "set-activity-sort": function setActivitySortAction() {
        var nextSortBy = String(activitySortBy || "").trim();
        if (!nextSortBy) {
          return;
        }
        if (state.ui.activitySortBy === nextSortBy) {
          state.ui.activitySortDir = state.ui.activitySortDir === "asc" ? "desc" : "asc";
        } else {
          state.ui.activitySortBy = nextSortBy;
          state.ui.activitySortDir = nextSortBy === "time" ? "desc" : "asc";
        }
        state.ui.activityPage = 1;
        renderStatus();
      },
      "activity-prev-page": function activityPrevPageAction() {
        state.ui.activityPage = Math.max(1, Number(state.ui.activityPage || 1) - 1);
        renderStatus();
      },
      "activity-next-page": function activityNextPageAction() {
        state.ui.activityPage = Math.max(1, Number(state.ui.activityPage || 1) + 1);
        renderStatus();
      },
      "activity-go-page": function activityGoPageAction() {
        if (!Number.isFinite(activityPageTarget)) {
          return;
        }
        state.ui.activityPage = Math.max(1, Math.trunc(activityPageTarget));
        renderStatus();
      },
      "audience-prev-page": function audiencePrevPageAction() {
        state.ui.audienceContactsPage = Math.max(1, Number(state.ui.audienceContactsPage || 1) - 1);
        renderAudience();
      },
      "audience-next-page": function audienceNextPageAction() {
        state.ui.audienceContactsPage = Math.max(1, Number(state.ui.audienceContactsPage || 1) + 1);
        renderAudience();
      },
      "hub-prev-page": function hubPrevPageAction() {
        state.ui.hubContactsPage = Math.max(1, Number(state.ui.hubContactsPage || 1) - 1);
        renderStatus();
      },
      "hub-next-page": function hubNextPageAction() {
        state.ui.hubContactsPage = Math.max(1, Number(state.ui.hubContactsPage || 1) + 1);
        renderStatus();
      },
      "open-bulk-approve": function openBulkApproveAction() {
        openBulkApprovalConfirm();
      },
      "cancel-bulk-approve": function cancelBulkApproveAction() {
        cancelBulkApprovalConfirm();
      },
      "confirm-bulk-approve": function confirmBulkApproveAction() {
        confirmBulkApprovalDue();
      },
      "approve-draft": function approveDraftAction() {
        approveDraft(draftId);
      },
      "reject-draft": function rejectDraftAction() {
        rejectDraft(draftId);
      },
      "regenerate-draft": function regenerateDraftAction() {
        regenerateDraft(draftId);
      },
      "simulate-human": function simulateHumanAction() {
        simulateHumanReply(enrollmentId);
      },
      "simulate-ooo": function simulateOOOAction() {
        simulateOOOReply(enrollmentId);
      },
      "stop-contact": function stopContactAction() {
        stopContactCampaign(enrollmentId);
      },
      "resume-contact": function resumeContactAction() {
        resumeStoppedContact(enrollmentId);
      },
      "open-remove-modal": function openRemoveModalAction() {
        openRemoveModal(enrollmentId, actionEl);
      },
      "close-modal": function closeModalAction() {
        closeModal(true);
      },
      "confirm-remove": function confirmRemoveAction() {
        confirmRemoval();
      },
      "confirm-status-change": function confirmStatusChangeAction() {
        confirmStatusChange();
      },
      "undo-remove": function undoRemoveAction() {
        undoRemoveContact();
      },
      "readd-contact": function readdContactAction() {
        readdContact(enrollmentId);
      }
    };

    var handler = actionHandlers[action];
    if (handler) {
      handler();
    }
  }

  function handleInput(event) {
    var target = event.target;

    if (target.matches("[data-campaign-field]")) {
      var field = target.getAttribute("data-campaign-field");
      var isTimingField = field === "sendWindowStart" || field === "sendWindowEnd" || field === "startDate";
      if (isCampaignSetupLocked() && !isTimingField) {
        setNotice("error", "Campaign has started; setup fields are locked.");
        render();
        return;
      }

      state.campaign[field] = target.value;
      invalidateCampaignApproval("Campaign setup changed.");
      syncDraftStatusFlag();
      renderAlert();
      renderHeader();
      renderTabs();
      renderMobileTray();
      return;
    }

    if (target.matches("[data-contact-filter-value]")) {
      state.ui.contactFilterValue = target.value;
      state.ui.audienceContactsPage = 1;
      renderAudience();
      return;
    }

    if (target.matches("[data-contact-global-search]")) {
      state.ui.sourceSearch = target.value;
      state.ui.audienceContactsPage = 1;
      renderAudience();
      return;
    }

    if (target.id === "remove-reason") {
      state.ui.removeReason = target.value;
      return;
    }

    if (target.matches("[data-step-field]")) {
      if (isCampaignSetupLocked()) {
        setNotice("error", "Campaign has started; sequence setup is locked.");
        render();
        return;
      }

      var idx = Number(target.getAttribute("data-step-index")) - 1;
      if (idx < 0 || idx >= state.sequenceSteps.length) {
        return;
      }

      var fieldName = target.getAttribute("data-step-field");
      if (fieldName === "triggerDay") {
        var rawDay = String(target.value || "").trim();
        if (!rawDay) {
          state.sequenceSteps[idx].triggerDay = null;
        } else {
          var parsedDay = Number(rawDay);
          state.sequenceSteps[idx].triggerDay = Number.isFinite(parsedDay) ? Math.trunc(parsedDay) : null;
        }
      } else {
        state.sequenceSteps[idx][fieldName] = target.value;
      }

      var stepIndex = idx + 1;
      markStepDraftsStale(stepIndex);
      if (fieldName === "genericSubjectTemplate" || fieldName === "genericBodyTemplate") {
        var previewContact = getExamplePreviewContact(stepIndex);
        renderExamplePreview(stepIndex, previewContact ? previewContact.id : null);
      }

      invalidateCampaignApproval("Sequence changed.");
      syncDraftStatusFlag();
      state.ui.sequenceValidationByStep = getSequenceValidation().byStep;
      renderAlert();
      renderTabs();
      renderHeader();
      renderMobileTray();
      return;
    }

  }

  function handleChange(event) {
    var target = event.target;

    if (target.matches("[data-contact-filter-field]")) {
      state.ui.contactFilterField = target.value || "name";
      state.ui.contactFilterValue = "";
      state.ui.contactFilterSource = "";
      state.ui.contactFilterStatus = "";
      state.ui.audienceContactsPage = 1;
      renderAudience();
      return;
    }

    if (target.matches("[data-contact-filter-source]")) {
      state.ui.contactFilterSource = target.value || "";
      state.ui.audienceContactsPage = 1;
      renderAudience();
      return;
    }

    if (target.matches("[data-contact-filter-status]")) {
      state.ui.contactFilterStatus = target.value || "";
      state.ui.audienceContactsPage = 1;
      renderAudience();
      return;
    }

    if (target.matches("[data-audience-page-size]")) {
      var audiencePageSize = Number(target.value);
      if (Number.isFinite(audiencePageSize) && audiencePageSize > 0) {
        state.ui.audienceContactsPageSize = Math.trunc(audiencePageSize);
      }
      state.ui.audienceContactsPage = 1;
      renderAudience();
      return;
    }

    if (target.matches("[data-audience-page]")) {
      var audiencePage = Number(target.value);
      if (Number.isFinite(audiencePage) && audiencePage > 0) {
        state.ui.audienceContactsPage = Math.trunc(audiencePage);
      }
      renderAudience();
      return;
    }

    if (target.matches("[data-hub-page-size]")) {
      var hubPageSize = Number(target.value);
      if (Number.isFinite(hubPageSize) && hubPageSize > 0) {
        state.ui.hubContactsPageSize = Math.trunc(hubPageSize);
      }
      state.ui.hubContactsPage = 1;
      renderStatus();
      return;
    }

    if (target.matches("[data-hub-page]")) {
      var hubPage = Number(target.value);
      if (Number.isFinite(hubPage) && hubPage > 0) {
        state.ui.hubContactsPage = Math.trunc(hubPage);
      }
      renderStatus();
      return;
    }

    if (target.matches(".status-select")) {
      var scope = target.getAttribute("data-status-scope");
      var campaignId = target.getAttribute("data-campaign-id");
      var selected = target.value;

      if (scope === "campaign") {
        var campaign = getCampaignById(campaignId);
        if (!campaign || !selected) {
          return;
        }
        var currentCampaignStatus = getOperationalStatus(campaign.status);
        if (currentCampaignStatus === selected) {
          return;
        }
        openStatusChangeModal("campaign", campaignId, null, selected, target);
        return;
      }

      if (scope === "contact") {
        var enrollmentId = target.getAttribute("data-enrollment-id");
        var effectiveCampaignId = campaignId || getStatusCampaignId();
        if (!effectiveCampaignId) {
          setNotice("error", "Select a campaign first.");
          render();
          return;
        }
        var enrollment = getCampaignEnrollment(effectiveCampaignId, enrollmentId);
        if (!enrollment || !selected) {
          return;
        }
        var currentContactStatus = getContactOperationalStatus(enrollment.status);
        if (currentContactStatus === selected) {
          return;
        }
        openStatusChangeModal("contact", effectiveCampaignId, enrollmentId, selected, target);
        return;
      }
    }

    if (target.matches("[data-contact-toggle]")) {
      if (isCampaignSetupLocked()) {
        setNotice("error", "Campaign has started; audience setup is locked.");
        render();
        return;
      }

      var contactId = target.getAttribute("data-contact-id");
      state.selectedContactIds[contactId] = target.checked;
      invalidateCampaignApproval("Audience selection changed.");
      syncDraftStatusFlag();
      render();
      return;
    }

    if (target.matches("[data-step-example-contact]")) {
      var stepId = Number(target.getAttribute("data-step-index"));
      var contactId = target.value || null;
      state.ui.sequencePreview.exampleContactIdByStep[stepId] = contactId;
      renderExamplePreview(stepId, contactId);
      renderSequence();
      return;
    }

    if (target.matches("[data-activity-filter]")) {
      state.ui.activityFilterAction = target.value || "all";
      state.ui.activityPage = 1;
      renderStatus();
      return;
    }

    if (target.matches("[data-activity-page-size]")) {
      var size = Number(target.value);
      if (Number.isFinite(size) && size > 0) {
        state.ui.activityPageSize = Math.trunc(size);
      }
      state.ui.activityPage = 1;
      renderStatus();
      return;
    }

    if (target.matches("[data-activity-page]")) {
      var page = Number(target.value);
      if (Number.isFinite(page) && page > 0) {
        state.ui.activityPage = Math.trunc(page);
      }
      renderStatus();
      return;
    }

  }

  // Keyboard, Focus & Navigation
  function trapModalFocus(event) {
    if (event.key !== "Tab" || !hasOpenModal()) {
      return;
    }

    var modal = document.querySelector(".modal-card");
    if (!modal) {
      return;
    }

    var focusables = Array.prototype.slice
      .call(modal.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
      .filter(function visible(el) {
        return !el.hasAttribute("disabled");
      });

    if (!focusables.length) {
      return;
    }

    var first = focusables[0];
    var last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleTabKeyNavigation(event) {
    var tab = event.target.closest(".screen-tab[data-screen]");
    if (!tab) {
      return;
    }

    var tabs = Array.prototype.slice.call(document.querySelectorAll(".screen-tab[data-screen]"));
    var currentIndex = tabs.indexOf(tab);
    if (currentIndex === -1) {
      return;
    }

    var nextIndex = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateScreen(tab.getAttribute("data-screen"));
      return;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      var nextTab = tabs[nextIndex];
      if (nextTab) {
        nextTab.focus();
      }
    }
  }

  function handleSequenceKeyboardShortcuts(event) {
    if (state.activeScreen !== "sequence") {
      return false;
    }

    var active = document.activeElement;
    if (!isEditableElement(active)) {
      return false;
    }

    var comboSave = (event.ctrlKey || event.metaKey) && event.key === "Enter";
    if (comboSave) {
      event.preventDefault();
      saveSequence();
      return true;
    }

    if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      var currentStep = Number(active.getAttribute("data-step-index"));
      if (!Number.isFinite(currentStep) || !currentStep) {
        return false;
      }

      event.preventDefault();
      if (event.key === "ArrowDown" && currentStep < state.sequenceSteps.length) {
        state.ui.expandedStepIndex = currentStep + 1;
        renderSequence();
        focusStepField(currentStep + 1, "subject");
      }
      if (event.key === "ArrowUp" && currentStep > 1) {
        state.ui.expandedStepIndex = currentStep - 1;
        renderSequence();
        focusStepField(currentStep - 1, "subject");
      }
      return true;
    }

    return false;
  }

  function handleKeydown(event) {
    if (handleSequenceKeyboardShortcuts(event)) {
      return;
    }

    if (isEditableElement(document.activeElement)) {
      return;
    }

    if (event.key === "Escape" && hasOpenModal()) {
      event.preventDefault();
      closeModal(true);
      return;
    }

    trapModalFocus(event);
    handleTabKeyNavigation(event);
  }

  function renderHeader() {
    syncWorkflowStatus();

    var line = document.getElementById("campaign-status-line");
    if (line) {
      var startedLabel = state.campaign.startedAt ? toLocaleLabel(state.campaign.startedAt) : "Not started";
      line.textContent =
        "Status: " +
        state.campaign.status +
        " | Timezone: " +
        (state.campaign.timezone || "UTC") +
        " | Simulation Day: " +
        state.simulationDay +
        " | Started: " +
        startedLabel;
    }

    var strip = document.getElementById("workflow-strip");
    if (!strip) {
      return;
    }

    var activeIndex = SCREENS.findIndex(function find(screen) {
      return screen.id === state.activeScreen;
    });

    var list = SCREENS.map(function map(screen, idx) {
      var klass = "workflow-step";
      var status = state.ui.workflowStepStatus[screen.id];
      if (status === "complete") {
        klass += " is-completed";
      }
      if (idx === activeIndex) {
        klass += " is-active";
      }
      if (status === "locked") {
        klass += " is-locked";
      }

      return (
        '<li class="' +
        klass +
        '"><span class="workflow-index">' +
        (idx + 1) +
        "</span> " +
        escapeHtml(screen.label) +
        "</li>"
      );
    }).join("");

    var currentLabel = activeIndex >= 0 ? SCREENS[activeIndex].label : STATUS_SCREEN.label;
    var nextAction = "Continue setup sequentially.";
    if (state.activeScreen === "audience") {
      if (state.ui.audienceSubStep === 1) {
        nextAction = canContinueAudienceStep1() ? "Continue to Campaign Setup." : "Select at least one contact.";
      } else {
        nextAction = validateCampaignSetup().isValid
          ? "Continue to Sequence."
          : "Complete campaign setup fields.";
      }
    } else if (state.activeScreen === "sequence") {
      nextAction = getSequenceValidation().isValid
        ? "Continue to Campaign Approval."
        : "Fix sequence validation errors.";
    } else if (state.activeScreen === "approval") {
      nextAction = isCampaignManageableStatus(state.campaign.status)
        ? "Review in Campaigns Hub."
        : "Approve and start campaign.";
    } else if (state.activeScreen === "status") {
      nextAction = "Review campaigns and contact status.";
    }

    strip.innerHTML =
      '<div class="workflow-meta">' +
      "<p><strong>Current:</strong> " +
      escapeHtml(currentLabel) +
      "</p>" +
      "<p><strong>Recommended next action:</strong> " +
      escapeHtml(nextAction) +
      "</p>" +
      "</div>" +
      '<ol class="workflow-list" aria-label="Flow progress">' +
      list +
      "</ol>";
  }

  // Rendering
  function renderAlert() {
    var root = document.getElementById("global-alert");
    if (!root) {
      return;
    }

    if (!state.notice) {
      root.innerHTML = "";
      return;
    }

    var klass = state.notice.kind === "error" ? "error" : "alert";
    root.innerHTML = '<div class="' + klass + '">' + escapeHtml(state.notice.text) + "</div>";
  }

  function renderAudience() {
    var container = document.getElementById("audience-content");
    if (!container) {
      return;
    }

    var setupLocked = isCampaignSetupLocked();
    var availableSources = getAvailableSources();
    var filtered = getFilteredContacts();
    var visibleEligible = getVisibleEligibleContacts();
    var selectedEligible = getSelectedEligibleContacts();
    var canStep1Continue = canContinueAudienceStep1();
    var campaignValidation = validateCampaignSetup();
    state.ui.audienceValidation = campaignValidation.errors;
    var contactSummary = getAudienceContactSummary();
    var campaignSummary = getAudienceCampaignSummary();
    var subStep = state.ui.audienceSubStep === 2 ? 2 : 1;
    var showContactsEditor = !state.ui.audienceCollapsed.contacts && subStep === 1;
    var showCampaignEditor = !state.ui.audienceCollapsed.campaignSetup && subStep === 2;
    var selectedVisibleEligible = visibleEligible.filter(function selected(contact) {
      return !!state.selectedContactIds[contact.id];
    }).length;
    var audiencePaged = paginateRows(filtered, state.ui.audienceContactsPage, state.ui.audienceContactsPageSize);
    state.ui.audienceContactsPage = audiencePaged.currentPage;

    var stepper =
      '<section class="panel stack audience-stepper-shell">' +
      '<div class="panel-header"><div><h2 id="audience-heading">Audience Setup</h2><p class="helper">Step 1 select contacts, then Step 2 configure campaign settings.</p></div>' +
      getStatusBadge(state.campaign.status) +
      "</div>" +
      '<div class="audience-stepper">' +
      '<span class="audience-step-chip' +
      (subStep === 1 ? " is-active" : canStep1Continue ? " is-complete" : "") +
      '">1 Select Contacts</span>' +
      '<span class="audience-step-chip' +
      (subStep === 2 ? " is-active" : campaignValidation.isValid ? " is-complete" : "") +
      '">2 Campaign Setup</span>' +
      "</div>" +
      "</section>";

    var filterField = String(state.ui.contactFilterField || "name");
    var filterLabel = filterField.charAt(0).toUpperCase() + filterField.slice(1);
    var filterMenuOpen = !!state.ui.isContactFilterMenuOpen;
    var sourceOptions = availableSources.slice();
    if (sourceOptions.indexOf("connectedhealth") === -1) {
      sourceOptions.push("connectedhealth");
    }
    sourceOptions.sort();

    var contactRows = audiencePaged.pageRows
      .map(function row(contact) {
        var checked = state.selectedContactIds[contact.id] ? " checked" : "";
        var disabled = !contact.eligible || contact.suppressed || isCampaignSetupLocked() ? " disabled" : "";
        var statusBadge = contact.suppressed
          ? '<span class="badge badge-suppressed">Suppressed</span>'
          : contact.eligible
            ? '<span class="badge badge-eligible">Eligible</span>'
            : '<span class="badge badge-ineligible">Ineligible</span>';
        var shortNotes = truncate(contact.notes || "", 96);

        return (
          "<tr>" +
          "<td>" +
          '<input type="checkbox" aria-label="Select ' +
          escapeHtml(contact.name) +
          '" data-contact-toggle data-contact-id="' +
          escapeHtml(contact.id) +
          '"' +
          checked +
          disabled +
          " /></td>" +
          "<td><strong>" +
          escapeHtml(contact.name) +
          "</strong></td>" +
          "<td>" +
          escapeHtml(contact.email) +
          "</td>" +
          "<td>" +
          escapeHtml(contact.source || "Unknown") +
          "</td>" +
          "<td>" +
          statusBadge +
          "</td>" +
          '<td title="' +
          escapeHtml(contact.notes || "") +
          '">' +
          escapeHtml(shortNotes || "-") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var contactsPager = renderContactsPager({
      scope: "audience",
      currentPage: audiencePaged.currentPage,
      totalPages: audiencePaged.totalPages,
      startIndex: audiencePaged.startIndex,
      endIndex: audiencePaged.endIndex,
      totalItems: audiencePaged.totalItems,
      pageSize: Number(state.ui.audienceContactsPageSize || 25),
      pageSizeOptions: state.ui.audienceContactsPageSizeOptions || [25, 50, 100]
    });

    var contactsSummaryCard =
      '<section class="panel stack audience-summary-card">' +
      '<div class="panel-header"><div><h3>Step 1 Summary</h3><p class="helper">Selected contacts and source mix.</p></div>' +
      '<button class="btn btn-secondary" type="button" data-action="audience-edit-contacts">Edit Contacts</button>' +
      "</div>" +
      '<p class="helper">Eligible selected: <strong>' +
      contactSummary.selectedCount +
      "</strong></p>" +
      '<p class="helper">Sources: <strong>' +
      escapeHtml(contactSummary.sourceSummary) +
      "</strong></p>" +
      "</section>";

    var campaignSummaryCard =
      '<section class="panel stack audience-summary-card">' +
      '<div class="panel-header"><div><h3>Step 2 Summary</h3><p class="helper">Campaign setup values.</p></div>' +
      '<button class="btn btn-secondary" type="button" data-action="audience-edit-campaign-setup">Edit Campaign Setup</button>' +
      "</div>" +
      '<div class="kpi-grid audience-mini-grid">' +
      '<article class="kpi-card"><p class="kpi-label">Campaign</p><p class="kpi-value slate">' +
      escapeHtml(campaignSummary.name) +
      '</p></article><article class="kpi-card"><p class="kpi-label">Timezone</p><p class="kpi-value slate">' +
      escapeHtml(campaignSummary.timezone) +
      '</p></article><article class="kpi-card"><p class="kpi-label">Send Window</p><p class="kpi-value slate">' +
      escapeHtml(campaignSummary.sendWindow) +
      '</p></article><article class="kpi-card"><p class="kpi-label">Start Date</p><p class="kpi-value slate">' +
      escapeHtml(campaignSummary.startDate) +
      "</p></article></div>" +
      "</section>";

    var filterIcon =
      '<span class="filter-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"></path></svg></span>';

    var contactsSection =
      '<section class="panel stack">' +
      '<div class="panel-header"><div><h3 class="selector-title">' +
      filterIcon +
      'Step 1: Select Contacts</h3><p class="helper">Use source filters and bulk actions to pick precise audience.</p></div></div>' +
      '<div class="row"><div class="stack"><label for="contact-global-search">Search</label><input id="contact-global-search" data-contact-global-search type="text" value="' +
      escapeHtml(state.ui.sourceSearch || "") +
      '" placeholder="Search name, email, source, notes..." /></div></div>' +
      '<div class="audience-filter-menu">' +
      '<button class="btn btn-secondary audience-filter-trigger" type="button" data-action="toggle-contact-filter-menu">' +
      filterIcon +
      'Filter Contacts</button>' +
      (filterMenuOpen
        ? ('<div class="action-menu-content">' +
          '<div class="row"><div class="stack"><label for="contact-filter-field">Filter By</label>' +
          '<select id="contact-filter-field" data-contact-filter-field>' +
          '<option value="name"' +
          (filterField === "name" ? " selected" : "") +
          ">Name</option>" +
          '<option value="email"' +
          (filterField === "email" ? " selected" : "") +
          ">Email</option>" +
          '<option value="source"' +
          (filterField === "source" ? " selected" : "") +
          ">Source</option>" +
          '<option value="status"' +
          (filterField === "status" ? " selected" : "") +
          ">Status</option>" +
          "</select></div></div>" +
          (filterField === "source"
            ? '<div class="row"><div class="stack"><label for="contact-filter-source">Source</label><select id="contact-filter-source" data-contact-filter-source><option value="">All sources</option>' +
              sourceOptions
                .map(function option(source) {
                  var selected = String(state.ui.contactFilterSource || "") === source ? " selected" : "";
                  return '<option value="' + escapeHtml(source) + '"' + selected + ">" + escapeHtml(source) + "</option>";
                })
                .join("") +
              "</select></div></div>"
            : filterField === "status"
              ? '<div class="row"><div class="stack"><label for="contact-filter-status">Status</label><select id="contact-filter-status" data-contact-filter-status><option value="">All statuses</option><option value="eligible"' +
                (state.ui.contactFilterStatus === "eligible" ? " selected" : "") +
                '>Eligible</option><option value="ineligible"' +
                (state.ui.contactFilterStatus === "ineligible" ? " selected" : "") +
                '>Ineligible</option><option value="suppressed"' +
                (state.ui.contactFilterStatus === "suppressed" ? " selected" : "") +
                ">Suppressed</option></select></div></div>"
              : '<div class="row"><div class="stack"><label for="contact-filter-value">' +
                escapeHtml(filterLabel) +
                '</label><input id="contact-filter-value" data-contact-filter-value type="text" value="' +
                escapeHtml(state.ui.contactFilterValue || "") +
                '" placeholder="Type to filter...' +
                escapeHtml(filterLabel.toLowerCase()) +
                '"/></div></div>') +
          '<div class="action-row"><button class="btn btn-secondary" type="button" data-action="clear-contact-filters">Clear Filters</button></div>' +
          "</div>")
        : "") +
      "</div>" +
      '<div class="contacts-bulk-bar">' +
      '<button class="btn btn-secondary" type="button" data-action="select-all-visible"' +
      (setupLocked ? " disabled" : "") +
      ">Select All Visible</button>" +
      '<button class="btn btn-secondary" type="button" data-action="clear-visible-selection"' +
      (setupLocked ? " disabled" : "") +
      ">Clear Visible</button>" +
      '<span class="helper">Visible eligible: <strong>' +
      selectedVisibleEligible +
      "</strong> / " +
      visibleEligible.length +
      "</span>" +
      '<span class="helper">Total eligible selected: <strong>' +
      selectedEligible.length +
      "</strong></span>" +
      '<span class="helper">Showing: <strong>' +
      filtered.length +
      "</strong> / " +
      state.contacts.length +
      "</span>" +
      "</div>" +
      '<div class="table-wrap audience-contacts-table"><table><thead><tr><th>Select</th><th>Name</th><th>Email</th><th>Source</th><th>Status</th><th>Notes</th></tr></thead><tbody>' +
      (contactRows || '<tr><td colspan="6" class="helper">No contacts match current filters.</td></tr>') +
      "</tbody></table></div>" +
      contactsPager +
      '<div class="step-footer">' +
      '<button class="btn btn-primary" type="button" data-action="audience-next-substep"' +
      disabledAttr(canStep1Continue ? "" : "Select at least one eligible contact to continue.") +
      ">Continue to Campaign Setup</button>" +
      "</div>" +
      reasonHint(canStep1Continue ? "" : "Select at least one eligible contact to continue.") +
      "</section>";

    var campaignSection =
      '<section class="panel stack">' +
      '<div class="panel-header"><div><h3>Step 2: Campaign Setup</h3><p class="helper">Configure campaign identity and send cadence.</p></div></div>' +
      '<div class="campaign-setup-grid">' +
      '<div class="stack"><label for="campaign-name">Campaign Name</label><input id="campaign-name" data-campaign-field="name" type="text" value="' +
      escapeHtml(state.campaign.name || "") +
      '"' +
      (setupLocked ? " disabled" : "") +
      " />" +
      (campaignValidation.errors.campaignName
        ? '<p class="field-error">' + escapeHtml(campaignValidation.errors.campaignName) + "</p>"
        : "") +
      "</div>" +
      '<div class="stack"><label for="campaign-timezone">Timezone</label><select id="campaign-timezone" data-campaign-field="timezone"' +
      (setupLocked ? " disabled" : "") +
      ">" +
      state.timezoneOptions
        .map(function option(tz) {
          var selected = tz === state.campaign.timezone ? " selected" : "";
          return '<option value="' + escapeHtml(tz) + '"' + selected + ">" + escapeHtml(tz) + "</option>";
        })
        .join("") +
      "</select>" +
      (campaignValidation.errors.timezone
        ? '<p class="field-error">' + escapeHtml(campaignValidation.errors.timezone) + "</p>"
        : "") +
      "</div>" +
      '<div class="stack"><label for="send-window-start">Send Window Start</label><input id="send-window-start" data-campaign-field="sendWindowStart" type="time" value="' +
      escapeHtml(state.campaign.sendWindowStart || "09:00") +
      '" /></div>' +
      '<div class="stack"><label for="send-window-end">Send Window End</label><input id="send-window-end" data-campaign-field="sendWindowEnd" type="time" value="' +
      escapeHtml(state.campaign.sendWindowEnd || "17:00") +
      '" /></div>' +
      '<div class="stack"><label for="campaign-start-date">Start Date</label><input id="campaign-start-date" data-campaign-field="startDate" type="date" value="' +
      escapeHtml(state.campaign.startDate || "") +
      '" />' +
      (campaignValidation.errors.startDate
        ? '<p class="field-error">' + escapeHtml(campaignValidation.errors.startDate) + "</p>"
        : "") +
      "</div>" +
      "</div>" +
      (campaignValidation.errors.sendWindow
        ? '<p class="field-error">' + escapeHtml(campaignValidation.errors.sendWindow) + "</p>"
        : '<p class="helper">Send window start must be earlier than end.</p>') +
      '<div class="step-footer">' +
      '<button class="btn btn-secondary" type="button" data-action="audience-prev-substep">Back</button>' +
      '<button class="btn btn-primary" type="button" data-action="continue-to-sequence"' +
      disabledAttr(campaignValidation.isValid ? "" : "Complete campaign setup fields before continuing.") +
      ">Continue to Sequence</button>" +
      "</div>" +
      reasonHint(campaignValidation.isValid ? "" : "Complete campaign setup fields before continuing.") +
      "</section>";

    var content = "";
    if (showContactsEditor) {
      content = contactsSection;
    } else if (showCampaignEditor) {
      content = contactsSummaryCard + campaignSection;
    } else {
      content = contactsSummaryCard + campaignSummaryCard;
    }

    container.innerHTML = '<div class="stack audience-shell">' + stepper + content + "</div>";
  }

  function renderSequence() {
    var container = document.getElementById("sequence-content");
    if (!container) {
      return;
    }

    var validation = getSequenceValidation();
    state.ui.sequenceValidationByStep = validation.byStep;

    var saveDisabledReason = validation.isValid ? "" : "Resolve validation errors before saving.";
    var addDisabledReason = state.sequenceSteps.length >= MAX_SEQUENCE_STEPS ? "Maximum 10 steps reached." : "";

    var stepRows = state.sequenceSteps
      .map(function stepRow(step) {
        var expanded = state.ui.expandedStepIndex === step.stepIndex;
        var lastSaved = state.ui.lastSavedAtByStep[step.stepIndex];
        var isPersonalized = step.composeMode === COMPOSE_MODE.PERSONALIZED;
        var modeLabel = isPersonalized ? "Personalized" : "Generic";
        var previewContacts = getSelectedEligibleContactsForPreview();
        var previewContact = getExamplePreviewContact(step.stepIndex);
        if (previewContact && !state.ui.sequencePreview.exampleSubjectByStep[step.stepIndex]) {
          renderExamplePreview(step.stepIndex, previewContact.id);
        }
        var exampleSubject = state.ui.sequencePreview.exampleSubjectByStep[step.stepIndex] || "";
        var exampleBody = state.ui.sequencePreview.exampleBodyByStep[step.stepIndex] || "";
        var lastPreviewed = state.ui.sequencePreview.lastPreviewedAtByStep[step.stepIndex];

        return (
          '<article class="step-accordion' +
          (expanded ? " is-open" : "") +
          '">' +
          '<button class="step-toggle" type="button" data-action="toggle-step" data-step-index="' +
          step.stepIndex +
          '" aria-expanded="' +
          String(expanded) +
          '">' +
          '<span class="step-title">Step ' +
          step.stepIndex +
          "</span>" +
          '<span class="step-summary">' +
          '<span class="timeline-chip">Day ' +
          escapeHtml(step.triggerDay === null ? "-" : step.triggerDay) +
          "</span>" +
          '<span class="timeline-chip timeline-chip-accent">' +
          modeLabel +
          "</span>" +
          '<span class="timeline-chip">' +
          escapeHtml(truncate(getStepSubjectTemplate(step) || "No subject", 28)) +
          "</span>" +
          "</span>" +
          '<span class="step-toggle-icon" aria-hidden="true">' +
          (expanded ? "−" : "+") +
          "</span>" +
          "</button>" +
          '<div class="step-content' +
          (expanded ? " is-open" : "") +
          '">' +
          '<div class="row">' +
          '<div class="stack"><label>Trigger Day</label><input type="number" min="0" step="1" data-step-field="triggerDay" data-step-index="' +
          step.stepIndex +
          '" value="' +
          escapeHtml(step.triggerDay === null ? "" : step.triggerDay) +
          '" />' +
          "</div>" +
          '<div class="stack"><label>Compose Mode</label><div class="mode-segmented">' +
          '<button class="mode-segment-btn' +
          (step.composeMode === COMPOSE_MODE.GENERIC ? " is-active" : "") +
          '" type="button" data-action="set-step-compose-mode" data-step-index="' +
          step.stepIndex +
          '" data-compose-mode="generic">Generic</button>' +
          '<button class="mode-segment-btn' +
          (step.composeMode === COMPOSE_MODE.PERSONALIZED ? " is-active" : "") +
          '" type="button" data-action="set-step-compose-mode" data-step-index="' +
          step.stepIndex +
          '" data-compose-mode="personalized">Personalized</button>' +
          "</div></div>" +
          "</div>" +
          (isPersonalized
            ? '<div class="stack"><label>Personalization Instructions</label><textarea data-step-field="personalizationPrompt" data-step-index="' +
              step.stepIndex +
              '">' +
              escapeHtml(step.personalizationPrompt || "") +
              "</textarea>" +
              '<p class="helper">Instructions generate the body first; subject is generated automatically.</p>' +
              "</div>" +
              '<div class="row"><button class="btn btn-secondary" type="button" data-action="generate-personalized-template" data-step-index="' +
              step.stepIndex +
              '">Generate Personalized Template</button>' +
              (step.lastGeneratedAt
                ? '<span class="helper">Last generated: ' + escapeHtml(toLocaleLabel(step.lastGeneratedAt)) + "</span>"
                : '<span class="helper">Not generated yet.</span>') +
              "</div>"
            : '<p class="helper">Generic mode keeps universal templates with placeholders.</p>') +
          '<div class="stack"><label>Subject Template</label><input type="text" data-step-field="genericSubjectTemplate" data-step-subject="' +
          step.stepIndex +
          '" data-step-index="' +
          step.stepIndex +
          '" value="' +
          escapeHtml(getStepSubjectTemplate(step)) +
          '" />' +
          "</div>" +
          '<div class="stack"><label>Body Template</label><textarea data-step-field="genericBodyTemplate" data-step-body="' +
          step.stepIndex +
          '" data-step-index="' +
          step.stepIndex +
          '">' +
          escapeHtml(getStepBodyTemplate(step)) +
          "</textarea>" +
          "</div>" +
          (isPersonalized
            ? '<section class="preview-card"><h4>Example Personalized Preview</h4>' +
              (previewContacts.length
                ? '<div class="stack"><label>Example Contact</label><select data-step-example-contact data-step-index="' +
                  step.stepIndex +
                  '">' +
                  previewContacts
                    .map(function option(contact) {
                      return (
                        '<option value="' +
                        escapeHtml(contact.id) +
                        '"' +
                        (previewContact && previewContact.id === contact.id ? " selected" : "") +
                        ">" +
                        escapeHtml(contact.name + " (" + contact.email + ")") +
                        "</option>"
                      );
                    })
                    .join("") +
                  "</select></div>" +
                  '<div class="preview-content"><p><strong>Subject:</strong> ' +
                  escapeHtml(exampleSubject || "Preview unavailable") +
                  "</p><p><strong>Body:</strong><br />" +
                  escapeHtml(exampleBody || "Preview unavailable").replace(/\n/g, "<br />") +
                  "</p></div>" +
                  '<p class="helper">Example only. Actual drafts are generated per recipient using their own notes context.</p>' +
                  (lastPreviewed ? '<p class="helper">Preview updated: ' + escapeHtml(toLocaleLabel(lastPreviewed)) + "</p>" : "")
                : '<div class="alert">Select at least one eligible contact in Audience to render preview examples.</div>') +
              "</section>"
            : "") +
          '<div class="row">' +
          '<div class="stack"><label>Step Actions</label><div class="inline-actions"><button class="btn btn-secondary" type="button" data-action="remove-step" data-step-index="' +
          step.stepIndex +
          '">Remove Step</button></div></div>' +
          "</div>" +
          '<p class="helper">Templates stay user-agnostic with placeholders; drafts personalize per contact at send time.</p>' +
          (lastSaved ? '<p class="helper saved-note">Saved at ' + escapeHtml(toLocaleLabel(lastSaved)) + "</p>" : "") +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    var timeline = state.sequenceSteps
      .map(function timelineChip(step) {
        return '<span class="timeline-chip">Step ' + step.stepIndex + " -> Day " + step.triggerDay + "</span>";
      })
      .join("");

    container.innerHTML =
      '<div class="layout-two sequence-shell">' +
      '<section class="panel stack">' +
      '<div class="panel-header"><div><h2 id="sequence-heading">Sequence Builder</h2><p class="helper">Configure generic or personalized steps for draft approval workflow.</p></div></div>' +
      '<p class="helper">All sends require approval drafts before delivery.</p>' +
      '<div class="action-row">' +
      '<button class="btn btn-primary" type="button" data-action="save-sequence"' +
      disabledAttr(saveDisabledReason) +
      ">Save Sequence</button>" +
      '<button class="btn btn-secondary" type="button" data-action="add-step"' +
      disabledAttr(addDisabledReason) +
      ">Add Step</button>" +
      '<span class="helper">Remaining steps: <strong>' +
      (MAX_SEQUENCE_STEPS - state.sequenceSteps.length) +
      "</strong></span>" +
      "</div>" +
      reasonHint(saveDisabledReason || addDisabledReason) +
      '<div class="step-list">' +
      stepRows +
      "</div>" +
      '<div class="step-footer-wrap">' +
      renderStepFooter("sequence") +
      "</div>" +
      "</section>" +
      '<aside class="panel stack sticky-panel">' +
      '<div class="panel-header"><h3>Timeline Preview</h3></div>' +
      '<div class="timeline">' +
      timeline +
      "</div>" +
      '<p class="helper">Step order is enforced by strictly increasing trigger days.</p>' +
      "</aside>" +
      "</div>";
  }

  function renderApproval() {
    var container = document.getElementById("approval-content");
    if (!container) {
      return;
    }

    var selected = getSelectedEligibleContacts();
    var bySource = {};
    selected.forEach(function count(contact) {
      var source = contact.source || "Unknown";
      bySource[source] = (bySource[source] || 0) + 1;
    });

    var sourceRows = Object.keys(bySource)
      .sort()
      .map(function row(source) {
        return '<li>' + escapeHtml(source) + ": <strong>" + bySource[source] + "</strong></li>";
      })
      .join("");
    var genericSteps = state.sequenceSteps.filter(function count(step) {
      return step.composeMode !== COMPOSE_MODE.PERSONALIZED;
    }).length;
    var personalizedSteps = state.sequenceSteps.length - genericSteps;

    var validation = getSequenceValidation();
    var completion = getStepCompletion();

    var startReason = "";
    if (!completion.audience || !validation.isValid) {
      startReason = "Complete Audience and valid Sequence before starting.";
    } else if (isCampaignSetupLocked()) {
      startReason =
        state.campaign.status === STATUS.STOPPED
          ? "Campaign is stopped. Resume it in Campaigns Hub."
          : "Campaign is already active.";
    }

    var invalidatedInfo = state.ui.approvalInvalidatedReason
      ? '<div class="error">Approval was invalidated: ' + escapeHtml(state.ui.approvalInvalidatedReason) + "</div>"
      : "";

    container.innerHTML =
      '<section class="panel stack">' +
      '<div class="panel-header"><div><h2 id="approval-heading">Campaign Approval</h2><p class="helper">Approval applies to the whole campaign configuration.</p></div>' +
      getStatusBadge(state.campaign.status) +
      "</div>" +
      invalidatedInfo +
      '<div class="approval-summary">' +
      '<h3>Review Summary</h3>' +
      '<p class="helper">Selected contacts: <strong>' +
      selected.length +
      "</strong></p>" +
      '<ul class="delta-list">' +
      (sourceRows || "<li>No contacts selected yet.</li>") +
      "</ul>" +
      '<p class="helper">Sequence steps: <strong>' +
      state.sequenceSteps.length +
      "</strong> | Generic: <strong>" +
      genericSteps +
      "</strong> | Personalized: <strong>" +
      personalizedSteps +
      "</strong> | Draft-required steps: <strong>" +
      state.sequenceSteps.length +
      '</strong> (all sends require draft approval)</p><p class="helper">Planned start date: <strong>' +
      escapeHtml(state.campaign.startDate || "Not set") +
      "</strong></p>" +
      "</div>" +
      '<p class="helper">Starting this campaign confirms campaign-level approval for this configuration.</p>' +
      '<div class="action-row">' +
      '<button class="btn btn-primary" type="button" data-action="start-campaign"' +
      disabledAttr(startReason) +
      ">Start Campaign</button>" +
      "</div>" +
      reasonHint(startReason) +
      (state.ui.campaignApproval.approved
        ? '<p class="helper">Approved by <strong>' +
          escapeHtml(state.ui.campaignApproval.approvedBy) +
          "</strong> at " +
          escapeHtml(toLocaleLabel(state.ui.campaignApproval.approvedAt)) +
          "</p>"
        : "") +
      '<div class="step-footer-wrap">' +
      renderStepFooter("approval") +
      "</div>" +
      "</section>";
  }

  function renderStatusApprovalQueue() {
    var activeDrafts = state.draftApprovalItems.filter(function keep(draft) {
      return !draft.isStale;
    });
    var counts = {
      all: activeDrafts.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      sent: 0
    };

    activeDrafts.forEach(function count(draft) {
      if (typeof counts[draft.approvalStatus] === "number") {
        counts[draft.approvalStatus] += 1;
      }
    });

    var duePending = getDuePendingDrafts();
    var bulkReason = duePending.length ? "" : "No pending due drafts to bulk approve.";

    var filterChips = ["all", "pending", "approved", "rejected", "sent"]
      .map(function chip(filter) {
        var active = state.ui.approvalFilter === filter;
        return (
          '<button class="filter-chip' +
          (active ? " is-active" : "") +
          '" type="button" data-action="set-approval-filter" data-filter="' +
          filter +
          '">' +
          escapeHtml(filter.charAt(0).toUpperCase() + filter.slice(1)) +
          " (" +
          counts[filter] +
          ")</button>"
        );
      })
      .join("");

    var filtered = activeDrafts
      .filter(function filterDrafts(draft) {
        return state.ui.approvalFilter === "all" ? true : draft.approvalStatus === state.ui.approvalFilter;
      })
      .sort(function byDate(a, b) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

    var cards = filtered
      .map(function card(draft) {
        var contact = getContact(draft.contactId);
        var statusClass =
          draft.approvalStatus === "pending"
            ? "badge-pending"
            : draft.approvalStatus === "approved"
              ? "badge-approved"
              : draft.approvalStatus === "rejected"
                ? "badge-rejected"
                : "badge-sent";

        var actions = "";
        if (draft.approvalStatus === "pending") {
          actions =
            '<button class="btn btn-teal" type="button" data-action="approve-draft" data-draft-id="' +
            draft.id +
            '">Approve</button>' +
            '<button class="btn btn-warning" type="button" data-action="reject-draft" data-draft-id="' +
            draft.id +
            '">Reject</button>';
        } else if (draft.approvalStatus === "rejected") {
          actions =
            '<button class="btn btn-secondary" type="button" data-action="regenerate-draft" data-draft-id="' +
            draft.id +
            '">Regenerate</button>' +
            '<button class="btn btn-teal" type="button" data-action="approve-draft" data-draft-id="' +
            draft.id +
            '">Approve</button>';
        } else if (draft.approvalStatus === "approved") {
          actions = '<span class="helper">Approved and waiting for send cycle.</span>';
        } else {
          actions = '<span class="helper">Already sent.</span>';
        }

        return (
          '<article class="approval-card">' +
          '<div class="panel-header">' +
          "<strong>" +
          escapeHtml(contact ? contact.name : "Unknown") +
          "</strong>" +
          '<span class="badge ' +
          statusClass +
          '">' +
          escapeHtml(draft.approvalStatus.toUpperCase()) +
          "</span>" +
          "</div>" +
          '<p class="helper">Step ' +
          draft.stepIndex +
          " | Updated " +
          escapeHtml(toLocaleLabel(draft.updatedAt)) +
          "</p>" +
          "<div><strong>Subject</strong><p>" +
          escapeHtml(draft.subjectDraft) +
          "</p></div>" +
          '<div><strong>Body</strong><p class="helper">' +
          escapeHtml(draft.bodyDraft) +
          "</p></div>" +
          '<div class="approval-actions">' +
          actions +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    var bulkConfirm = state.ui.bulkActionConfirmOpen
      ? '<div class="inline-confirm">' +
        '<p class="helper">Approve all pending drafts due by Day ' +
        state.simulationDay +
        "?</p>" +
        '<button class="btn btn-primary" type="button" data-action="confirm-bulk-approve">Confirm Bulk Approve</button>' +
        '<button class="btn btn-secondary" type="button" data-action="cancel-bulk-approve">Cancel</button>' +
        "</div>"
      : "";

    return (
      '<section class="panel stack">' +
      '<div class="panel-header"><div><h3>Draft Approval Queue</h3><p class="helper">Operational action area after campaign setup.</p></div></div>' +
      '<div class="filter-row">' +
      filterChips +
      "</div>" +
      '<div class="action-row">' +
      '<button class="btn btn-primary" type="button" data-action="open-bulk-approve"' +
      disabledAttr(bulkReason) +
      ">Approve All Pending for Due Day</button>" +
      "</div>" +
      reasonHint(bulkReason) +
      bulkConfirm +
      (cards ? '<div class="approval-grid">' + cards + "</div>" : '<div class="alert">No drafts match this filter.</div>') +
      "</section>"
    );
  }

  function inferLegacyEventCampaignId(eventItem) {
    if (!eventItem) {
      return null;
    }

    if (eventItem.meta && eventItem.meta.campaignId) {
      return eventItem.meta.campaignId;
    }

    if (eventItem.contactId) {
      var campaignMatches = [];
      Object.keys(state.campaignEnrollments || {}).forEach(function scanCampaign(campaignId) {
        var scoped = getCampaignEnrollments(campaignId);
        var match = scoped.some(function hasContact(enrollment) {
          return enrollment.contactId === eventItem.contactId;
        });
        if (match) {
          campaignMatches.push(campaignId);
        }
      });
      if (campaignMatches.length === 1) {
        return campaignMatches[0];
      }
    }

    if (eventItem.type === "status_campaign_switched" && eventItem.meta && eventItem.meta.toCampaignId) {
      return eventItem.meta.toCampaignId;
    }

    return null;
  }

  function getEventsForCampaign(campaignId) {
    if (!campaignId) {
      return [];
    }
    return state.events
      .map(function normalize(eventItem) {
        if (!eventItem.campaignId) {
          var inferred = inferLegacyEventCampaignId(eventItem);
          return Object.assign({}, eventItem, {
            campaignId: inferred || null,
            legacyUnscoped: inferred ? false : true
          });
        }
        return Object.assign({}, eventItem, {
          legacyUnscoped: false
        });
      })
      .filter(function inScope(eventItem) {
        return eventItem.campaignId === campaignId;
      });
  }

  function computeCampaignMetrics(campaignId) {
    var sent = 0;
    var qualifyingReplies = 0;
    var oooReplies = 0;
    var stepMap = {};
    var events = getEventsForCampaign(campaignId);

    events.forEach(function aggregate(eventItem) {
      var step = eventItem.stepIndex || 1;
      if (!stepMap[step]) {
        stepMap[step] = { sends: 0, replies: 0 };
      }

      if (eventItem.type === "send") {
        sent += 1;
        stepMap[step].sends += 1;
      }
      if (eventItem.type === "qualifying_reply") {
        qualifyingReplies += 1;
        stepMap[step].replies += 1;
      }
      if (eventItem.type === "ooo_reply") {
        oooReplies += 1;
      }
    });

    return {
      sent: sent,
      qualifyingReplies: qualifyingReplies,
      oooReplies: oooReplies,
      responseRate: sent ? ((qualifyingReplies / sent) * 100).toFixed(1) + "%" : "0.0%",
      stepMap: stepMap
    };
  }

  function humanizeEventType(type) {
    var key = String(type || "").trim();
    var labels = {
      send: "Email sent",
      qualifying_reply: "Qualifying reply",
      ooo_reply: "Out-of-office reply",
      campaign_status_changed: "Campaign status changed",
      contact_status_changed: "Contact status changed",
      removed: "Contact removed",
      undo_remove: "Removal undone",
      readded: "Contact re-added",
      bulk_approve: "Bulk approval",
      status_campaign_switched: "Campaign selected"
    };
    if (labels[key]) {
      return labels[key];
    }
    return key ? key.replace(/_/g, " ") : "Activity";
  }

  function buildActivityMessage(eventItem, contactName) {
    var name = contactName || "Contact";
    var type = String((eventItem && eventItem.type) || "");
    var meta = (eventItem && eventItem.meta) || {};
    if (type === "send") {
      return "Email sent to " + name + ".";
    }
    if (type === "qualifying_reply") {
      return "Qualifying reply received from " + name + ".";
    }
    if (type === "ooo_reply") {
      return "Out-of-office reply received from " + name + ".";
    }
    if (type === "campaign_status_changed") {
      return "Campaign status changed: " + String(meta.fromStatus || "-") + " -> " + String(meta.toStatus || "-") + ".";
    }
    if (type === "contact_status_changed") {
      return "Contact status changed: " + String(meta.fromStatus || "-") + " -> " + String(meta.toStatus || "-") + ".";
    }
    if (type === "removed") {
      return "Contact removed from campaign." + (meta.reason ? " Reason: " + meta.reason + "." : "");
    }
    if (type === "undo_remove") {
      return "Removal undone and contact restored.";
    }
    if (type === "readded") {
      return "Contact re-added to campaign sequence.";
    }
    if (type === "bulk_approve") {
      return "Bulk approved " + String(meta.count || 0) + " draft(s).";
    }
    if (type === "status_campaign_switched") {
      return "Switched view to selected campaign.";
    }
    return humanizeEventType(type) + ".";
  }

  function buildActivityRows(campaignId) {
    if (!campaignId) {
      return [];
    }
    return getEventsForCampaign(campaignId).map(function toRow(eventItem, index) {
      var contact = eventItem.contactId ? getContact(eventItem.contactId) : null;
      var contactName = contact ? contact.name : "System";
      var contactEmail = contact ? String(contact.email || "-") : "-";
      var stepLabel = Number.isFinite(Number(eventItem.stepIndex)) ? "Step " + String(eventItem.stepIndex) : "-";
      return {
        id: eventItem.id || "event_" + String(index),
        eventType: String(eventItem.type || ""),
        name: contactName,
        email: contactEmail,
        lastAction: humanizeEventType(eventItem.type),
        message: buildActivityMessage(eventItem, contactName),
        stepLabel: stepLabel,
        stepValue: Number.isFinite(Number(eventItem.stepIndex)) ? Number(eventItem.stepIndex) : 0,
        timeIso: eventItem.timestamp || null,
        timeLabel: toLocaleLabel(eventItem.timestamp)
      };
    });
  }

  function filterActivityRows(rows) {
    var filter = String(state.ui.activityFilterAction || "all");
    if (filter === "all") {
      return rows;
    }
    return rows.filter(function byFilter(row) {
      return row.eventType === filter;
    });
  }

  function sortActivityRows(rows) {
    var sortBy = String(state.ui.activitySortBy || "time");
    var dir = String(state.ui.activitySortDir || "desc") === "asc" ? 1 : -1;
    return rows.slice().sort(function bySort(a, b) {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name) * dir;
      }
      if (sortBy === "lastAction") {
        return a.lastAction.localeCompare(b.lastAction) * dir;
      }
      if (sortBy === "step") {
        return (a.stepValue - b.stepValue) * dir;
      }
      var aTime = a.timeIso ? new Date(a.timeIso).getTime() : 0;
      var bTime = b.timeIso ? new Date(b.timeIso).getTime() : 0;
      return (aTime - bTime) * dir;
    });
  }

  function paginateActivityRows(rows) {
    var pageSize = Math.max(1, Number(state.ui.activityPageSize || 50));
    var totalItems = rows.length;
    var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    var currentPage = Math.min(totalPages, Math.max(1, Number(state.ui.activityPage || 1)));
    state.ui.activityPage = currentPage;
    var startIndex = (currentPage - 1) * pageSize;
    var endIndexExclusive = Math.min(startIndex + pageSize, totalItems);
    return {
      pageRows: rows.slice(startIndex, endIndexExclusive),
      totalItems: totalItems,
      totalPages: totalPages,
      currentPage: currentPage,
      startIndex: totalItems ? startIndex + 1 : 0,
      endIndex: endIndexExclusive
    };
  }

  function renderContactsPager(opts) {
    var scope = opts && opts.scope === "hub" ? "hub" : "audience";
    var currentPage = Math.max(1, Number((opts && opts.currentPage) || 1));
    var totalPages = Math.max(1, Number((opts && opts.totalPages) || 1));
    var pageSize = Math.max(1, Number((opts && opts.pageSize) || 25));
    var pageSizeOptions = opts && Array.isArray(opts.pageSizeOptions) ? opts.pageSizeOptions : [25, 50, 100];
    var startIndex = Number((opts && opts.startIndex) || 0);
    var endIndex = Number((opts && opts.endIndex) || 0);
    var totalItems = Number((opts && opts.totalItems) || 0);
    var prevAction = scope === "hub" ? "hub-prev-page" : "audience-prev-page";
    var nextAction = scope === "hub" ? "hub-next-page" : "audience-next-page";
    var pageSizeAttr = scope === "hub" ? "data-hub-page-size" : "data-audience-page-size";
    var pageAttr = scope === "hub" ? "data-hub-page" : "data-audience-page";
    var pageOptions = Array.from({ length: totalPages }, function map(_, idx) {
      var page = idx + 1;
      return '<option value="' + page + '"' + (page === currentPage ? " selected" : "") + ">" + page + "</option>";
    }).join("");

    return (
      '<div class="contacts-pager">' +
      '<div class="contacts-pager-left">' +
      '<label class="helper" for="' +
      scope +
      '-contacts-page-size">Items per page</label>' +
      '<select id="' +
      scope +
      '-contacts-page-size" class="status-select" ' +
      pageSizeAttr +
      ">" +
      pageSizeOptions
        .map(function option(size) {
          return '<option value="' + size + '"' + (Number(size) === pageSize ? " selected" : "") + ">" + size + "</option>";
        })
        .join("") +
      "</select>" +
      '<span class="helper">' +
      startIndex +
      "-" +
      endIndex +
      " of " +
      totalItems +
      " items</span>" +
      "</div>" +
      '<div class="contacts-pager-right">' +
      '<button class="btn btn-secondary" type="button" data-action="' +
      prevAction +
      '"' +
      disabledAttr(currentPage <= 1 ? "First page" : "") +
      ">Prev</button>" +
      '<select class="status-select" ' +
      pageAttr +
      ">" +
      pageOptions +
      "</select>" +
      '<span class="helper">of ' +
      totalPages +
      "</span>" +
      '<button class="btn btn-secondary" type="button" data-action="' +
      nextAction +
      '"' +
      disabledAttr(currentPage >= totalPages ? "Last page" : "") +
      ">Next</button>" +
      "</div>" +
      "</div>"
    );
  }

  function renderActivitySection(campaignId) {
    var allRows = buildActivityRows(campaignId);
    var filteredRows = filterActivityRows(allRows);
    var sortedRows = sortActivityRows(filteredRows);
    var paged = paginateActivityRows(sortedRows);
    var eventTypes = {};
    allRows.forEach(function collect(row) {
      eventTypes[row.eventType] = true;
    });
    var actionOptions = Object.keys(eventTypes).sort();
    var sortArrow = state.ui.activitySortDir === "asc" ? "↑" : "↓";
    var rowsHtml = paged.pageRows
      .map(function row(item) {
        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(item.name) +
          "</strong></td>" +
          "<td>" +
          escapeHtml(item.email || "-") +
          "</td>" +
          "<td>" +
          escapeHtml(item.lastAction) +
          "</td>" +
          '<td class="activity-message-cell" title="' +
          escapeHtml(item.message) +
          '">' +
          escapeHtml(item.message) +
          "</td>" +
          "<td>" +
          escapeHtml(item.stepLabel) +
          "</td>" +
          "<td>" +
          escapeHtml(item.timeLabel) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var pageOptions = Array.from({ length: paged.totalPages }, function map(_, idx) {
      var page = idx + 1;
      return '<option value="' + page + '"' + (page === paged.currentPage ? " selected" : "") + ">" + page + "</option>";
    }).join("");

    return (
      '<section class="panel stack activity-panel">' +
      '<div class="panel-header"><div><h3>Step 4: Activity</h3><p class="helper">Audit log for campaign activity events.</p></div>' +
      '<div class="activity-controls-inline"><label for="activity-filter" class="helper">Filter by</label>' +
      '<select id="activity-filter" class="status-select" data-activity-filter><option value="all"' +
      (state.ui.activityFilterAction === "all" ? " selected" : "") +
      ">All Actions</option>" +
      actionOptions
        .map(function option(type) {
          var selected = state.ui.activityFilterAction === type ? " selected" : "";
          return '<option value="' + escapeHtml(type) + '"' + selected + ">" + escapeHtml(humanizeEventType(type)) + "</option>";
        })
        .join("") +
      "</select></div></div>" +
      '<div class="table-wrap"><table><thead><tr>' +
      '<th><button class="activity-sort" type="button" data-action="set-activity-sort" data-sort-by="name">Name ' +
      (state.ui.activitySortBy === "name" ? sortArrow : "") +
      "</button></th>" +
      "<th>Email</th>" +
      '<th><button class="activity-sort" type="button" data-action="set-activity-sort" data-sort-by="lastAction">Last action ' +
      (state.ui.activitySortBy === "lastAction" ? sortArrow : "") +
      "</button></th>" +
      '<th>Message</th>' +
      '<th><button class="activity-sort" type="button" data-action="set-activity-sort" data-sort-by="step">Step ' +
      (state.ui.activitySortBy === "step" ? sortArrow : "") +
      "</button></th>" +
      '<th><button class="activity-sort" type="button" data-action="set-activity-sort" data-sort-by="time">Time ' +
      (state.ui.activitySortBy === "time" ? sortArrow : "") +
      "</button></th>" +
      "</tr></thead><tbody>" +
      (rowsHtml || '<tr><td colspan="6" class="helper">No activity yet for this campaign.</td></tr>') +
      "</tbody></table></div>" +
      '<div class="activity-footer">' +
      '<div class="activity-footer-left">' +
      '<label for="activity-page-size" class="helper">Items per page</label>' +
      '<select id="activity-page-size" class="status-select" data-activity-page-size>' +
      (state.ui.activityPageSizeOptions || [25, 50, 100])
        .map(function map(size) {
          return '<option value="' + size + '"' + (Number(state.ui.activityPageSize) === Number(size) ? " selected" : "") + ">" + size + "</option>";
        })
        .join("") +
      "</select>" +
      '<span class="helper">' +
      paged.startIndex +
      "-" +
      paged.endIndex +
      " of " +
      paged.totalItems +
      " items</span></div>" +
      '<div class="activity-footer-right">' +
      '<button class="btn btn-secondary" type="button" data-action="activity-prev-page"' +
      disabledAttr(paged.currentPage <= 1 ? "First page" : "") +
      ">Prev</button>" +
      '<select class="status-select" data-activity-page>' +
      pageOptions +
      "</select>" +
      '<span class="helper">of ' +
      paged.totalPages +
      "</span>" +
      '<button class="btn btn-secondary" type="button" data-action="activity-next-page"' +
      disabledAttr(paged.currentPage >= paged.totalPages ? "Last page" : "") +
      ">Next</button>" +
      "</div></div>" +
      "</section>"
    );
  }

  function getSequenceStepsForCampaign(campaignId) {
    if (!campaignId) {
      return [];
    }
    if (campaignId === state.campaign.id) {
      return state.sequenceSteps;
    }
    return state.sequenceSteps;
  }

  function renderKpiSection(campaignId) {
    var sequenceSteps = getSequenceStepsForCampaign(campaignId);
    if (!sequenceSteps.length) {
      return (
        '<section class="panel stack">' +
        '<div class="panel-header"><div><h3>KPI and Metrics</h3><p class="helper">No sequence configured for this campaign.</p></div></div>' +
        "</section>"
      );
    }

    var metrics = computeCampaignMetrics(campaignId);

    var bars = sequenceSteps
      .map(function row(step) {
        var bucket = metrics.stepMap[step.stepIndex] || { sends: 0, replies: 0 };
        var ratio = bucket.sends ? (bucket.replies / bucket.sends) * 100 : 0;
        return (
          '<div class="kpi-bar-row">' +
          '<div class="kpi-bar-meta"><span>Step ' +
          step.stepIndex +
          "</span><span>" +
          ratio.toFixed(1) +
          "%</span></div>" +
          '<div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:' +
          ratio.toFixed(1) +
          '%"></div></div>' +
          '<p class="helper">Sends: ' +
          bucket.sends +
          " | Replies: " +
          bucket.replies +
          "</p>" +
          "</div>"
        );
      })
      .join("");

    var tableRows = sequenceSteps
      .map(function table(step) {
        var bucket = metrics.stepMap[step.stepIndex] || { sends: 0, replies: 0 };
        var ratio = bucket.sends ? ((bucket.replies / bucket.sends) * 100).toFixed(1) + "%" : "0.0%";
        return (
          "<tr><td>Step " +
          step.stepIndex +
          "</td><td>" +
          bucket.sends +
          "</td><td>" +
          bucket.replies +
          "</td><td>" +
          ratio +
          "</td></tr>"
        );
      })
      .join("");

    return (
      '<section class="panel stack">' +
      '<div class="panel-header"><div><h3>KPI and Metrics</h3><p class="helper">Campaign-scoped metrics for the selected campaign.</p></div></div>' +
      '<article class="formula-card">' +
      '<p class="kpi-label">Response / Email Sent</p>' +
      '<p class="formula-value">' +
      metrics.responseRate +
      "</p>" +
      '<p class="formula-detail">' +
      metrics.qualifyingReplies +
      " qualifying replies / " +
      metrics.sent +
      " emails sent</p>" +
      "</article>" +
      '<div class="kpi-grid">' +
      '<article class="kpi-card"><p class="kpi-label">Response Rate</p><p class="kpi-value slate">' +
      metrics.responseRate +
      "</p></article>" +
      '<article class="kpi-card"><p class="kpi-label">Emails Sent</p><p class="kpi-value slate">' +
      metrics.sent +
      "</p></article>" +
      '<article class="kpi-card"><p class="kpi-label">Qualifying Replies</p><p class="kpi-value teal">' +
      metrics.qualifyingReplies +
      "</p></article>" +
      '<article class="kpi-card"><p class="kpi-label">OOO Ignored</p><p class="kpi-value amber">' +
      metrics.oooReplies +
      "</p></article>" +
      "</div>" +
      (metrics.sent
        ? ""
        : '<div class="alert">No sends yet for this campaign. KPI values will update after send events.</div>') +
      '<div class="kpi-bars">' +
      bars +
      "</div>" +
      '<div class="table-wrap"><table><thead><tr><th>Step</th><th>Sends</th><th>Replies</th><th>Response Rate</th></tr></thead><tbody>' +
      tableRows +
      "</tbody></table></div>" +
      "</section>"
    );
  }

  function renderCampaignRegistrySection(selectedCampaignId, options) {
    var sectionOptions = options || {};
    var selectedCampaign = getCampaignById(selectedCampaignId);
    var isCollapsed = !!state.ui.isCampaignDirectoryCollapsed;
    var headerToggleLabel = isCollapsed ? "Expand" : "Collapse";
    var headerTitle = sectionOptions.title || "All Campaigns";
    var headerHelper = sectionOptions.helper || "Status shows every campaign in this mock session.";
    var footerHtml = sectionOptions.footerHtml || "";
    var selectedSummary = selectedCampaign
      ? escapeHtml(selectedCampaign.name || selectedCampaign.id) +
        " • " +
        escapeHtml(getOperationalStatus(selectedCampaign.status || STATUS.DRAFT))
      : "No campaign selected";

    var rows = state.campaignRegistry
      .slice()
      .sort(function byStartDate(a, b) {
        var aDateRaw = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        var bDateRaw = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        var aDate = Number.isNaN(aDateRaw) ? 0 : aDateRaw;
        var bDate = Number.isNaN(bDateRaw) ? 0 : bDateRaw;
        return bDate - aDate;
      })
      .map(function toRow(campaign) {
        var isCurrent = campaign.id === state.campaign.id;
        var isSelected = campaign.id === selectedCampaignId;
        var displayCampaignStatus = getOperationalStatus(campaign.status || STATUS.DRAFT);
        var startDate = campaign.startDate || "-";
        var windowLabel = (campaign.sendWindowStart || "-") + " - " + (campaign.sendWindowEnd || "-");
        var viewLabel = isSelected ? "Viewing" : "View Contacts";
        var campaignActions =
          '<div class="status-selector">' +
          '<select id="campaign-status-select-' +
          escapeHtml(campaign.id) +
          '" class="status-select" data-status-scope="campaign" data-campaign-id="' +
          escapeHtml(campaign.id) +
          '" aria-label="Campaign status">' +
          '<option value="ACTIVE"' +
          (displayCampaignStatus === STATUS.ACTIVE ? " selected" : "") +
          ">ACTIVE</option>" +
          '<option value="STOPPED"' +
          (displayCampaignStatus === STATUS.STOPPED ? " selected" : "") +
          ">STOPPED</option>" +
          '<option value="COMPLETED"' +
          (displayCampaignStatus === STATUS.COMPLETED ? " selected" : "") +
          ">COMPLETED</option>" +
          "</select>" +
          "</div>";

        return (
          '<tr class="campaign-row campaign-directory-row' +
          (isSelected ? " is-selected" : "") +
          '">' +
          "<td><strong>" +
          escapeHtml(campaign.name || campaign.id || "Untitled Campaign") +
          "</strong><br/><span class=\"helper\">" +
          escapeHtml(campaign.id || "-") +
          "</span></td>" +
          "<td>" +
          getStatusBadge(displayCampaignStatus) +
          "</td>" +
          "<td>" +
          escapeHtml(campaign.timezone || "UTC") +
          "</td>" +
          "<td>" +
          escapeHtml(windowLabel) +
          "</td>" +
          "<td>" +
          escapeHtml(startDate) +
          "</td>" +
          "<td>" +
          escapeHtml(toLocaleLabelWithTimezone(campaign.startedAt, campaign.timezone || "UTC")) +
          "</td>" +
          '<td class="campaign-view-cell"><button class="btn btn-secondary" type="button" data-action="select-status-campaign" data-campaign-id="' +
          escapeHtml(campaign.id) +
          '"' +
          (isSelected ? ' aria-current="true"' : "") +
          ">" +
          escapeHtml(viewLabel) +
          "</button>" +
          "</td>" +
          "<td>" +
          campaignActions +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var compactSummaryAction = "";
    if (selectedCampaign) {
      var compactOperational = getOperationalStatus(selectedCampaign.status || STATUS.DRAFT);
      compactSummaryAction =
        '<div class="status-selector">' +
        '<select id="campaign-status-select-compact" class="status-select" data-status-scope="campaign" data-campaign-id="' +
        escapeHtml(selectedCampaign.id) +
        '" aria-label="Selected campaign status">' +
        '<option value="ACTIVE"' +
        (compactOperational === STATUS.ACTIVE ? " selected" : "") +
        ">ACTIVE</option>" +
        '<option value="STOPPED"' +
        (compactOperational === STATUS.STOPPED ? " selected" : "") +
        ">STOPPED</option>" +
        '<option value="COMPLETED"' +
        (compactOperational === STATUS.COMPLETED ? " selected" : "") +
        ">COMPLETED</option>" +
        "</select>" +
        "</div>";
    }
    var compactSummary =
      '<div class="campaign-directory-compact">' +
      '<p class="helper"><strong>Selected:</strong> ' +
      selectedSummary +
      "</p>" +
      '<div class="campaign-directory-header-actions">' +
      (compactSummaryAction || "") +
      "</div>" +
      "</div>";

    return (
      '<section class="panel stack campaign-directory' +
      (isCollapsed ? " is-collapsed" : "") +
      '">' +
      '<div class="panel-header"><div><h2>' +
      escapeHtml(headerTitle) +
      "</h2><p class=\"helper\">" +
      escapeHtml(headerHelper) +
      '</p></div><div class="campaign-directory-header-actions"><button class="btn btn-secondary" type="button" data-action="toggle-campaign-directory">' +
      headerToggleLabel +
      "</button></div></div>" +
      compactSummary +
      (isCollapsed
        ? ""
        : '<div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Timezone</th><th>Send Window</th><th>Planned Start Date</th><th>Started At</th><th>View</th><th>Actions</th></tr></thead><tbody>' +
          rows +
          "</tbody></table></div>") +
      footerHtml +
      "</section>"
    );
  }

  function renderStatus() {
    var container = document.getElementById("status-content");
    if (!container) {
      return;
    }

    if (!state.ui.selectedStatusCampaignId || !getCampaignById(state.ui.selectedStatusCampaignId)) {
      state.ui.selectedStatusCampaignId = null;
      state.ui.statusJourneyStep = 1;
      state.ui.isCampaignDirectoryCollapsed = false;
      resetStatusJourneyVisited();
    }

    var selectedCampaignId = state.ui.selectedStatusCampaignId;
    var selectedCampaign = selectedCampaignId ? getStatusCampaign() : null;
    var selectedEnrollments = selectedCampaignId ? getStatusCampaignEnrollments() : [];
    var selectedCampaignTimezone = selectedCampaign ? selectedCampaign.timezone || "UTC" : "UTC";
    var viewingCurrentCampaign = isViewingCurrentStatusCampaign();
    var manageMode = !!selectedCampaign && state.ui.statusViewMode === "manage";
    var selectedCampaignOperationalStatus = selectedCampaign
      ? getOperationalStatus(selectedCampaign.status)
      : STATUS.STOPPED;
    var stepTotalLabel = viewingCurrentCampaign ? String(state.sequenceSteps.length) : "-";
    var statusJourneyStep = Math.max(1, Math.min(4, Number(state.ui.statusJourneyStep || 1)));
    if (!state.ui.statusJourneyVisited || typeof state.ui.statusJourneyVisited !== "object") {
      resetStatusJourneyVisited();
    }
    state.ui.statusJourneyVisited[1] = true;
    state.ui.statusJourneyStep = statusJourneyStep;

    var campaignRegistrySection = renderCampaignRegistrySection(selectedCampaignId);

    var statusCounts = { active: 0, stopped: 0 };
    var buckets = {
      all: selectedEnrollments.length,
      active: 0,
      stopped: 0
    };

    selectedEnrollments.forEach(function count(enrollment) {
      var displayStatus = getContactOperationalStatus(enrollment.status);
      if (displayStatus === STATUS.ACTIVE) {
        buckets.active += 1;
        statusCounts.active += 1;
      } else if (displayStatus === STATUS.STOPPED) {
        buckets.stopped += 1;
        statusCounts.stopped += 1;
      }
    });

    var filterChips = ["all", "active", "stopped"]
      .map(function chip(filter) {
        var active = state.ui.statusFilter === filter;
        return (
          '<button class="filter-chip' +
          (active ? " is-active" : "") +
          '" type="button" data-action="set-status-filter" data-filter="' +
          filter +
          '">' +
          escapeHtml(filter.charAt(0).toUpperCase() + filter.slice(1)) +
          " (" +
          buckets[filter] +
          ")</button>"
        );
      })
      .join("");

    var filteredRows = selectedEnrollments
      .filter(function filterRows(enrollment) {
        var displayStatus = getContactOperationalStatus(enrollment.status);
        if (state.ui.statusFilter === "all") {
          return true;
        }
        if (state.ui.statusFilter === "active") {
          return displayStatus === STATUS.ACTIVE;
        }
        if (state.ui.statusFilter === "stopped") {
          return displayStatus === STATUS.STOPPED;
        }
        return true;
      });
    var hubPaged = paginateRows(filteredRows, state.ui.hubContactsPage, state.ui.hubContactsPageSize);
    state.ui.hubContactsPage = hubPaged.currentPage;
    var rows = hubPaged.pageRows
      .map(function row(enrollment) {
        var displayStatus = getContactOperationalStatus(enrollment.status);
        var contact = getContact(enrollment.contactId);
        var canEditStatusRow = !!selectedCampaignId && enrollment.campaignId === selectedCampaignId;

        var statusActions =
          canEditStatusRow
            ? (function buildContactStatusSelect() {
                var contactSelectId = "contact-status-select-" + enrollment.id;
                return (
                  '<div class="status-selector">' +
                  '<select id="' +
                  contactSelectId +
                  '" class="status-select" data-status-scope="contact" data-campaign-id="' +
                  escapeHtml(selectedCampaignId || "") +
                  '" data-enrollment-id="' +
                  enrollment.id +
                  '" aria-label="Contact status">' +
                  '<option value="ACTIVE"' +
                  (displayStatus === STATUS.ACTIVE ? " selected" : "") +
                  ">ACTIVE</option>" +
                  '<option value="STOPPED"' +
                  (displayStatus === STATUS.STOPPED ? " selected" : "") +
                  ">STOPPED</option>" +
                  "</select>" +
                  "</div>"
                );
              })()
            : '<p class="helper">No status actions.</p>';

        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(contact ? contact.name : enrollment.contactId) +
          "</strong><br/><span class=\"helper\">" +
          escapeHtml(contact ? contact.email : "-") +
          "</span></td>" +
          "<td>" +
          getStatusBadge(displayStatus) +
          "</td>" +
          "<td>" +
          enrollment.currentStep +
          " / " +
          stepTotalLabel +
          "</td>" +
          "<td>Day " +
          (enrollment.nextSendDay === null ? "-" : enrollment.nextSendDay) +
          "<br/><span class=\"helper\">" +
          escapeHtml(toLocaleLabelWithTimezone(enrollment.nextSendAt, selectedCampaignTimezone)) +
          "</span></td>" +
          "<td>" +
          escapeHtml(enrollment.gmailThreadId) +
          "<br/><span class=\"helper\">" +
          escapeHtml(enrollment.threadState || "-") +
          "</span>" +
          (enrollment.stoppedByCampaign ? '<br/><span class="helper">Paused by campaign stop</span>' : "") +
          (enrollment.removedReason
            ? '<br/><span class="helper">Reason: ' + escapeHtml(enrollment.removedReason) + "</span>"
            : "") +
          "</td>" +
          "<td>" +
          statusActions +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    var hubContactsPager = renderContactsPager({
      scope: "hub",
      currentPage: hubPaged.currentPage,
      totalPages: hubPaged.totalPages,
      startIndex: hubPaged.startIndex,
      endIndex: hubPaged.endIndex,
      totalItems: hubPaged.totalItems,
      pageSize: Number(state.ui.hubContactsPageSize || 25),
      pageSizeOptions: state.ui.hubContactsPageSizeOptions || [25, 50, 100]
    });

    var selectedCampaignBanner = selectedCampaign
      ? '<div class="alert">Selected campaign: <strong>' +
        escapeHtml(selectedCampaign.name || selectedCampaign.id || "-") +
        "</strong> (" +
        escapeHtml(selectedCampaignOperationalStatus) +
        ")</div>"
      : '<div class="alert">Step 1: Select a campaign to continue.</div>';

    var rowContent = rows || '<tr><td colspan="6" class="helper">No contacts for this campaign/filter.</td></tr>';

    var modeText = manageMode
      ? "Use status actions to manage contacts for the current campaign."
      : "Read-only view. Switch to the current active campaign to manage statuses.";

    var journeyLabels = ["Select Campaign", "Review Contacts", "Review KPIs", "Activity"];
    var journeyStrip = journeyLabels
      .map(function mapStep(label, idx) {
        var number = idx + 1;
        var chipReason = "";
        if (number > 1 && !selectedCampaignId) {
          chipReason = "Select a campaign first.";
        } else if (number === 3 && !state.ui.statusJourneyVisited[2]) {
          chipReason = "Complete Step 2 first.";
        } else if (number === 4 && !state.ui.statusJourneyVisited[3]) {
          chipReason = "Complete Step 3 first.";
        }
        var klass = "filter-chip";
        if (number === statusJourneyStep) {
          klass += " is-active";
        } else if (state.ui.statusJourneyVisited[number]) {
          klass += " is-complete";
        }
        if (chipReason) {
          klass += " is-disabled";
        }
        return (
          '<button class="' +
          klass +
          '" type="button" data-action="status-go-step" data-step="' +
          number +
          '"' +
          disabledAttr(chipReason) +
          ">" +
          number +
          ". " +
          escapeHtml(label) +
          "</button>"
        );
      })
      .join("");

    var backReason = statusJourneyStep === 1 ? "You are on the first step." : "";
    var primaryLabel = statusJourneyStep === 4 ? "All Campaigns" : "Continue";
    var primaryAction = statusJourneyStep === 4 ? "status-go-all-campaigns" : "status-next-step";
    var primaryReason = !selectedCampaignId && statusJourneyStep < 4 ? "Select a campaign to continue." : "";
    var stepNav =
      '<div class="step-footer">' +
      '<button class="btn btn-secondary" type="button" data-action="status-prev-step"' +
      disabledAttr(backReason) +
      ">Back</button>" +
      '<button class="btn btn-primary" type="button" data-action="' +
      primaryAction +
      '"' +
      disabledAttr(primaryReason) +
      ">" +
      escapeHtml(primaryLabel) +
      "</button>" +
      "</div>" +
      reasonHint(primaryReason || backReason);

    var collapsedSections = "";
    var activeStepSection = "";

    if (statusJourneyStep >= 2 && selectedCampaign) {
      collapsedSections +=
        '<section class="panel stack status-step-summary">' +
        '<div class="panel-header"><div><h3>Step 1 Complete</h3><p class="helper">Campaign selected and collapsed.</p></div><span class="badge badge-approved">Done</span></div>' +
        '<p class="helper"><strong>' +
        escapeHtml(selectedCampaign.name || selectedCampaign.id || "-") +
        "</strong> | " +
        escapeHtml(selectedCampaign.timezone || "UTC") +
        " | " +
        escapeHtml((selectedCampaign.sendWindowStart || "-") + " - " + (selectedCampaign.sendWindowEnd || "-")) +
        "</p>" +
        "</section>";
    }

    if (statusJourneyStep >= 3 && selectedCampaign) {
      collapsedSections +=
        '<section class="panel stack status-step-summary">' +
        '<div class="panel-header"><div><h3>Step 2 Complete</h3><p class="helper">Contacts reviewed and collapsed.</p></div><span class="badge badge-approved">Done</span></div>' +
        '<div class="filter-row">' +
        '<span class="timeline-chip">Contacts ' +
        selectedEnrollments.length +
        "</span>" +
        '<span class="timeline-chip">Active ' +
        statusCounts.active +
        "</span>" +
        '<span class="timeline-chip">Stopped ' +
        statusCounts.stopped +
        "</span>" +
        "</div>" +
        "</section>";
    }

    if (statusJourneyStep >= 4 && selectedCampaign) {
      var kpiSummary = computeCampaignMetrics(selectedCampaignId);
      collapsedSections +=
        '<section class="panel stack status-step-summary">' +
        '<div class="panel-header"><div><h3>Step 3 Complete</h3><p class="helper">KPIs reviewed and collapsed.</p></div><span class="badge badge-approved">Done</span></div>' +
        '<div class="filter-row">' +
        '<span class="timeline-chip">Response ' +
        escapeHtml(kpiSummary.responseRate) +
        "</span>" +
        '<span class="timeline-chip">Sent ' +
        kpiSummary.sent +
        "</span>" +
        '<span class="timeline-chip">Replies ' +
        kpiSummary.qualifyingReplies +
        "</span>" +
        "</div>" +
        "</section>";
    }

    if (statusJourneyStep === 1) {
      activeStepSection = renderCampaignRegistrySection(selectedCampaignId, {
        title: "Step 1: Select Campaign",
        helper: "Choose the campaign you want to inspect and manage.",
        footerHtml: stepNav
      });
    } else if (statusJourneyStep === 2 && selectedCampaign) {
      activeStepSection =
        '<section class="panel stack">' +
        '<div class="panel-header"><div><h3>Step 2: Review Contacts</h3><p class="helper">' +
        escapeHtml(modeText) +
        "</p></div></div>" +
        '<div class="filter-row">' +
        filterChips +
        "</div>" +
        '<div class="table-wrap"><table><thead><tr><th>Contact</th><th>Status</th><th>Current Step</th><th>Next Send</th><th>Thread</th><th>Status Actions</th></tr></thead><tbody>' +
        rowContent +
        "</tbody></table></div>" +
        hubContactsPager +
        stepNav +
        "</section>";
    } else if (statusJourneyStep === 3 && selectedCampaign) {
      activeStepSection =
        '<section class="panel stack">' +
        '<div class="panel-header"><div><h3>Step 3: Review KPIs</h3><p class="helper">Review response rate, sends, and replies performance.</p></div></div>' +
        "</section>" +
        renderKpiSection(selectedCampaignId) +
        '<section class="panel stack">' +
        stepNav +
        "</section>";
    } else if (statusJourneyStep === 4 && selectedCampaign) {
      activeStepSection = renderActivitySection(selectedCampaignId) + '<section class="panel stack">' + stepNav + "</section>";
    } else {
      activeStepSection = campaignRegistrySection;
    }

    container.innerHTML =
      '<div class="stack status-shell">' +
      '<section class="panel stack status-steps-panel">' +
      '<div class="panel-header"><div><h2>Campaigns Hub</h2><p class="helper">Follow the guided flow: select campaign, review contacts, review KPIs, then activity.</p></div></div>' +
      '<div class="filter-row">' +
      journeyStrip +
      "</div>" +
      selectedCampaignBanner +
      "</section>" +
      collapsedSections +
      activeStepSection +
      "</div>";
  }

  function renderTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".screen-tab[data-screen]"));

    tabs.forEach(function setTab(tab) {
      var screen = tab.getAttribute("data-screen");
      var isActive = screen === state.activeScreen;
      var locked = !canNavigateTo(screen) && screen !== state.activeScreen;
      tab.classList.toggle("is-active", isActive);
      tab.classList.toggle("is-locked", locked);
      tab.setAttribute("aria-selected", String(isActive));
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
      tab.setAttribute("aria-disabled", String(locked));
    });
  }

  function renderScreens() {
    var allScreens = SCREENS.concat([STATUS_SCREEN]);
    allScreens.forEach(function toggle(screen) {
      var section = document.getElementById("screen-" + screen.id);
      if (!section) {
        return;
      }
      var active = screen.id === state.activeScreen;
      section.classList.toggle("is-active", active);
      section.setAttribute("aria-hidden", String(!active));
    });
  }

  function renderModal() {
    var root = document.getElementById("modal-root");
    if (!root) {
      return;
    }

    var pendingStatusChange = state.ui.statusChangeConfirm;
    if (pendingStatusChange && pendingStatusChange.scope) {
      var pendingCampaign = getCampaignById(pendingStatusChange.campaignId);
      if (!pendingCampaign) {
        root.innerHTML = "";
        return;
      }
      if (pendingStatusChange.scope === "campaign") {
        root.innerHTML =
          '<div class="modal-backdrop" role="presentation">' +
          '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="status-modal-title" aria-describedby="status-modal-desc">' +
          '<h3 id="status-modal-title">Confirm Campaign Status Change</h3>' +
          '<p id="status-modal-desc" class="helper">Campaign: <strong>' +
          escapeHtml(pendingCampaign.name || pendingCampaign.id) +
          "</strong></p>" +
          '<div class="alert">Set status to <strong>' +
          escapeHtml(pendingStatusChange.targetStatus) +
          "</strong>?</div>" +
          '<p class="helper">This updates campaign behavior and related contact progression.</p>' +
          '<div class="approval-actions">' +
          '<button class="btn btn-primary" type="button" data-action="confirm-status-change">Confirm</button>' +
          '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
          "</div>" +
          "</div>" +
          "</div>";
        return;
      }

      if (pendingStatusChange.scope === "contact") {
        var pendingEnrollment = getCampaignEnrollment(pendingStatusChange.campaignId, pendingStatusChange.enrollmentId);
        if (!pendingEnrollment) {
          root.innerHTML = "";
          return;
        }
        var pendingContact = getContact(pendingEnrollment.contactId);
        root.innerHTML =
          '<div class="modal-backdrop" role="presentation">' +
          '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="status-modal-title" aria-describedby="status-modal-desc">' +
          '<h3 id="status-modal-title">Confirm Contact Status Change</h3>' +
          '<p id="status-modal-desc" class="helper">Contact: <strong>' +
          escapeHtml(pendingContact ? pendingContact.name : pendingEnrollment.contactId) +
          '</strong> in campaign <strong>' +
          escapeHtml(pendingCampaign.name || pendingCampaign.id) +
          "</strong></p>" +
          '<div class="alert">Set status to <strong>' +
          escapeHtml(pendingStatusChange.targetStatus) +
          "</strong>?</div>" +
          '<p class="helper">This change is scoped to this campaign contact enrollment only.</p>' +
          '<div class="approval-actions">' +
          '<button class="btn btn-primary" type="button" data-action="confirm-status-change">Confirm</button>' +
          '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
          "</div>" +
          "</div>" +
          "</div>";
        return;
      }
    }

    if (state.ui.startCampaignConfirmOpen) {
      var selectedContacts = getSelectedEligibleContacts();
      root.innerHTML =
        '<div class="modal-backdrop" role="presentation">' +
        '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="start-modal-title" aria-describedby="start-modal-desc">' +
        '<h3 id="start-modal-title">Start Campaign</h3>' +
        '<p id="start-modal-desc" class="helper">This will approve and start <strong>' +
        escapeHtml(state.campaign.name || "current campaign") +
        "</strong>.</p>" +
        '<div class="alert">Selected contacts: <strong>' +
        selectedContacts.length +
        "</strong> | Sequence steps: <strong>" +
        state.sequenceSteps.length +
        "</strong></div>" +
        '<p class="helper">Once started, setup fields are locked and send-cycle actions move to Campaigns Hub.</p>' +
        '<div class="approval-actions">' +
        '<button class="btn btn-primary" type="button" data-action="confirm-start-campaign">Start Campaign</button>' +
        '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        "</div>" +
        "</div>" +
        "</div>";
      return;
    }

    var enrollment = getEnrollment(state.ui.removeModalTargetId);
    if (!enrollment) {
      root.innerHTML = "";
      return;
    }

    var contact = getContact(enrollment.contactId);
    var campaign = getCampaignById(enrollment.campaignId || state.campaign.id);
    root.innerHTML =
      '<div class="modal-backdrop" role="presentation">' +
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="remove-modal-title" aria-describedby="remove-modal-desc">' +
      '<h3 id="remove-modal-title">Remove ' +
      escapeHtml(contact ? contact.name : "contact") +
      " from this campaign sequence?</h3>" +
      '<p id="remove-modal-desc" class="helper">Campaign: <strong>' +
      escapeHtml(campaign ? campaign.name : state.campaign.name || "Current Campaign") +
      "</strong>. This action is campaign-scoped and cancels remaining sends for this contact.</p>" +
      '<div class="error danger-zone">Consequence: future steps stop immediately in this campaign.</div>' +
      '<label for="remove-reason">Reason for removal (required)</label>' +
      '<textarea id="remove-reason" placeholder="Example: Requested pause until Q4">' +
      escapeHtml(state.ui.removeReason || "") +
      "</textarea>" +
      '<p class="helper">Audit preview: actor <strong>' +
      escapeHtml(APPROVAL_ACTOR) +
      "</strong>, timestamp recorded on confirm.</p>" +
      '<div class="approval-actions">' +
      '<button class="btn btn-danger" type="button" data-action="confirm-remove">Confirm Remove</button>' +
      '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
      "</div>" +
      "</div>" +
      "</div>";
  }

  function renderUndoToast() {
    var root = document.getElementById("undo-toast-root");
    if (!root) {
      return;
    }

    var undoState = state.ui.removeUndo;
    if (!undoState || !undoState.enrollmentId || !undoState.snapshot) {
      root.innerHTML = "";
      return;
    }

    if (!getRemoveUndoRemainingSeconds()) {
      root.innerHTML = "";
      return;
    }

    var enrollment = getEnrollment(undoState.enrollmentId);
    var fallbackContactId = undoState.snapshot && undoState.snapshot.contactId ? undoState.snapshot.contactId : null;
    var contact = enrollment ? getContact(enrollment.contactId) : getContact(fallbackContactId);

    root.innerHTML =
      '<div class="undo-toast" role="status" aria-live="polite">' +
      '<div><strong>Contact removed.</strong><p class="helper">Undo this action for ' +
      escapeHtml(contact ? contact.name : "this contact") +
      ".</p></div>" +
      '<button class="btn btn-secondary" type="button" data-action="undo-remove">Undo</button>' +
      "</div>";
  }

  function renderMobileTray() {
    var tray = document.getElementById("mobile-action-tray");
    if (!tray) {
      return;
    }

    var actions = [];
    var screen = state.activeScreen;

    if (screen === "audience") {
      var audienceContinueInfo = getContinueInfo("audience");
      actions.push({
        label: state.ui.audienceSubStep === 1 ? "Campaign Setup" : "Sequence",
        action: audienceContinueInfo.action,
        variant: "btn-primary",
        reason: audienceContinueInfo.disabledReason
      });
      if (state.ui.audienceSubStep === 2) {
        actions.push({
          label: "Back",
          action: "audience-prev-substep",
          variant: "btn-secondary",
          reason: ""
        });
      }
    } else if (screen === "sequence") {
      actions.push({
        label: "Save",
        action: "save-sequence",
        variant: "btn-primary",
        reason: getSequenceValidation().isValid ? "" : "Fix errors first"
      });
      actions.push({
        label: "Next",
        action: "continue-to-approval",
        variant: "btn-secondary",
        reason: getContinueInfo("sequence").disabledReason
      });
    } else if (screen === "approval") {
      var completion = getStepCompletion();
      actions.push({
        label: "Start",
        action: "start-campaign",
        variant: "btn-primary",
        reason:
          !completion.audience || !getSequenceValidation().isValid
            ? "Complete Audience and Sequence first"
            : isCampaignSetupLocked()
              ? state.campaign.status === STATUS.STOPPED
                ? "Campaign is stopped"
                : "Campaign already active"
              : ""
      });
    } else if (screen === "status") {
      var statusStep = Math.max(1, Math.min(4, Number(state.ui.statusJourneyStep || 1)));
      var hasSelection = !!state.ui.selectedStatusCampaignId;
      actions.push({
        label: "Back",
        action: "status-prev-step",
        variant: "btn-secondary",
        reason: statusStep === 1 ? "You are on the first step." : ""
      });
      actions.push({
        label: statusStep === 4 ? "All Campaigns" : "Continue",
        action: statusStep === 4 ? "status-go-all-campaigns" : "status-next-step",
        variant: "btn-primary",
        reason: statusStep < 4 && !hasSelection ? "Select a campaign first" : ""
      });
    }

    if (!actions.length) {
      tray.innerHTML = "";
      return;
    }

    var firstReason = actions.reduce(function first(found, item) {
      return found || item.reason;
    }, "");

    tray.innerHTML =
      '<div class="mobile-tray-inner">' +
      actions
        .map(function button(item) {
          return (
            '<button class="btn ' +
            item.variant +
            '" type="button" data-action="' +
            item.action +
            '"' +
            disabledAttr(item.reason) +
            ">" +
            escapeHtml(item.label) +
            "</button>"
          );
        })
        .join("") +
      (firstReason ? '<p class="helper mobile-tray-note">' + escapeHtml(firstReason) + "</p>" : "") +
      "</div>";
  }

  function render() {
    syncDraftStatusFlag();
    syncCampaignRegistry();
    syncStatusViewMode();
    syncWorkflowStatus();
    renderHeader();
    renderAlert();
    renderTabs();
    renderScreens();
    renderAudience();
    renderSequence();
    renderApproval();
    renderStatus();
    renderModal();
    renderUndoToast();
    renderMobileTray();
  }

  function init() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("keydown", handleKeydown);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
