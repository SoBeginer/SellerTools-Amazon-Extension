(async function () {
  "use strict";

  if (window.__notifPrefsRunning) { console.log("[NotifPrefs] already running in this page context, skipping"); return; }
  window.__notifPrefsRunning = true;

  const SECTIONS = [
    { sectionName: "ACCOUNT_NOTIFICATIONS", groups: [
      { groupName: "BUSINESS_UPDATE_NOTIFICATIONS_EMAIL", label: "Business Updates" },
      { groupName: "TECHNICAL_NOTIFICATIONS_EMAIL", label: "Technical Notifications" },
      { groupName: "BUYER_FRAUD_NOTIFICATIONS_EMAIL", label: "Buyer Abuse Prevention" },
    ]},
    { sectionName: "FBA_INBOUND_SHIPMENT_STATUS_NOTIFICATIONS", groups: [
      { groupName: "INBOUND_SHIPMENT_DELIVERY_CHANGE_EMAIL", label: "Delivery Plan Changes" },
    ]},
    { sectionName: "ORDER_NOTIFICATIONS", groups: [
      { groupName: "SOLD_SHIP_NOW_EMAIL", label: "Merchant Order Notifications" },
    ]},
    { sectionName: "REFUNDS_CLAIMS_NOTIFICATIONS", groups: [
      { groupName: "RETURN_NOTIFICATIONS_EMAIL", label: "Pending Returns" },
      { groupName: "CLAIMS_NOTIFICATIONS_EMAIL", label: "Claims Notifications" },
      { groupName: "REFUND_NOTIFICATION_EMAIL", label: "Refund Notifications" },
    ]},
    { sectionName: "LISTING_NOTIFICATIONS", groups: [
      { groupName: "LISTING_CREATED_EMAIL", label: "Listing Created" },
      { groupName: "LISTING_RECOMMENDATION_EMAIL", label: "Listing Recommendations" },
      { groupName: "LISTING_CLOSED_EMAIL", label: "Listing Closed" },
      { groupName: "PARS_ITEM_ISSUE_EMAIL", label: "Compliance Requirements" },
      { groupName: "INVENTORY_REMOVAL_EMAIL", label: "Inventory Removal" },
    ]},
    { sectionName: "REPORT_NOTIFICATIONS", groups: [
      { groupName: "BUNDLE_SALES_REPORT_EMAIL", label: "Bundle Sales Report" },
      { groupName: "OPEN_LISTINGS_REPORT_EMAIL", label: "Open Listings Report" },
      { groupName: "ORDER_FULFILLMENT_REPORT_EMAIL", label: "Order Fulfillment Report" },
      { groupName: "SOLD_LISTINGS_REPORT_EMAIL", label: "Sold Listings Report" },
      { groupName: "CANCELLED_LISTINGS_REPORT_EMAIL", label: "Cancelled Listings Report" },
    ]},
    { sectionName: "B2B_PRICE_QUOTE_REQUEST", groups: [
      { groupName: "B2B_PRICE_QUOTE_REQUEST_EMAIL", label: "Quote Requests" },
    ]},
    { sectionName: "BUYER_SELLER_MESSAGING_NOTIFICATIONS", groups: [
      { groupName: "BUYER_MESSAGES_NOTIFICATIONS_EMAIL", label: "Buyer Messages" },
      { groupName: "CONFIRMATION_NOTIFICATIONS_EMAIL", label: "Confirmation Notifications" },
      { groupName: "DELIVERY_FAILURE_NOTIFICATIONS_EMAIL", label: "Delivery Failures" },
      { groupName: "BSM_OPTOUT_NOTIFICATIONS_EMAIL", label: "Buyer Opt-out" },
    ]},
    { sectionName: "MARKETING_NOTIFICATIONS", groups: [
      { groupName: "MARKETING_EMAIL", label: "Marketing" },
    ]},
    { sectionName: "PRICING_OFFER_NOTIFICATIONS", groups: [
      { groupName: "FEATURED_OFFER_EMAIL", label: "Featured Offer" },
      { groupName: "PRICING_NO_SALE_EMAIL", label: "Pricing Notifications" },
    ]},
    { sectionName: "LISTINGS_REQUIRING_ATTENTION", groups: [
      { groupName: "LISTINGS_REMOVALS_EMAIL", label: "Listings Removals" },
    ]},
  ];

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function log(msg) { console.log(`[NotifPrefs] ${msg}`); }

  function isInEditMode(form) {
    return !!form.querySelector('[data-action="save-edit-section"]');
  }

  async function waitForCondition(fn, timeoutMs = 15000, intervalMs = 500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fn()) return true;
      await sleep(intervalMs);
    }
    return false;
  }

  function emailExistsInGroup(form, groupName, email) {
    const groupEl = form.querySelector(`.preferences-value-column [data-preference-set-group-name="${groupName}"]`);
    if (!groupEl) return false;
    const col = groupEl.closest(".preferences-value-column");
    if (!col) return false;
    const inputs = col.querySelectorAll('input[type="text"], input[type="email"]');
    return [...inputs].some((i) => i.value.trim().toLowerCase() === email.trim().toLowerCase());
  }

  async function addEmailToGroup(form, groupName, email) {
    const addMoreRow = form.querySelector(`.add-more-row[data-preference-set-group-name="${groupName}"]`);
    if (!addMoreRow) return { success: false, reason: "no_add_more_row" };

    if (emailExistsInGroup(form, groupName, email)) {
      log(`${groupName}: already has ${email}`);
      return { success: false, reason: "already_exists" };
    }

    if (addMoreRow.querySelector(".add-more-link.disabled")) {
      log(`${groupName}: at limit`);
      return { success: false, reason: "at_limit" };
    }

    const addLink = addMoreRow.querySelector('[data-action="add-more"] a');
    if (!addLink) return { success: false, reason: "no_add_link" };

    addLink.click();
    await sleep(500);

    const groupEl = form.querySelector(`.preferences-value-column [data-preference-set-group-name="${groupName}"]`);
    if (!groupEl) return { success: false, reason: "no_group_el" };
    const col = groupEl.closest(".preferences-value-column");
    if (!col) return { success: false, reason: "no_col" };

    // Amazon creates input[type="text"] with name containing "newPreferenceSets" after add-more click
    let newInput = col.querySelector('input[name*="newPreferenceSets"][name*="endpointValue"]');
    if (!newInput) {
      // Fallback: last empty named text input (exclude template fields without name)
      const inputs = [...col.querySelectorAll('input[type="text"][name]')];
      newInput = inputs.reverse().find((i) => !i.value.trim());
    }
    if (!newInput) return { success: false, reason: "no_new_input" };

    newInput.value = email;
    newInput.dispatchEvent(new Event("input", { bubbles: true }));
    newInput.dispatchEvent(new Event("change", { bubbles: true }));
    log(`${groupName}: added ${email} → ${newInput.name}`);
    return { success: true };
  }

  async function processSection(sectionName, groups, email, onBeforeSave) {
    const forms = document.querySelectorAll("form.preference-expansion-section");
    const form = [...forms].find((f) =>
      f.getAttribute("data-section-name") === sectionName ||
      f.querySelector('input[name="name"]')?.value === sectionName
    );
    if (!form) {
      log(`Section not found: ${sectionName}`);
      return { sectionName, error: "not_found", results: [] };
    }

    if (!isInEditMode(form)) {
      const editBtn = form.querySelector('[data-action="edit-section"]');
      if (!editBtn) return { sectionName, error: "no_edit_btn", results: [] };
      editBtn.click();
      log(`${sectionName}: waiting for edit mode…`);
      const loaded = await waitForCondition(() => isInEditMode(form), 15000);
      if (!loaded) return { sectionName, error: "edit_timeout", results: [] };
    }

    log(`${sectionName}: edit mode open`);
    const results = [];
    for (const group of groups) {
      const r = await addEmailToGroup(form, group.groupName, email);
      results.push({ groupName: group.groupName, label: group.label, ...r });
    }

    // Signal background BEFORE save — save may cause a full page reload
    if (onBeforeSave) await onBeforeSave({ sectionName, results }).catch(() => {});

    const saveBtn = form.querySelector('[data-action="save-edit-section"]');
    if (saveBtn) {
      saveBtn.click();
      log(`${sectionName}: saved`);
      await waitForCondition(() => !isInEditMode(form), 10000);
      await sleep(300);
    }

    return { sectionName, results };
  }

  console.log("[NotifPrefs] SCRIPT INJECTED");

  let stateResp;
  try {
    stateResp = await chrome.runtime.sendMessage({ type: "GET_NOTIF_PREFS_STATE" });
  } catch (err) {
    console.error("[NotifPrefs] sendMessage error:", err);
    return;
  }
  console.log("[NotifPrefs] stateResp:", JSON.stringify(stateResp));
  if (!stateResp?.success) {
    log("Could not get state from background");
    return;
  }

  const { email, sectionIndex = 0 } = stateResp;
  log(`Starting from section index ${sectionIndex}, adding ${email}`);

  log("Waiting for preference forms to render...");
  const formsReady = await waitForCondition(
    () => document.querySelectorAll("form.preference-expansion-section").length > 0,
    30000,
    1000
  );
  if (!formsReady) {
    log("Timed out — no preference forms found on page");
    chrome.runtime.sendMessage({ type: "NOTIF_PREFS_MARKET_DONE", sectionResults: [] });
    return;
  }
  log(`Forms found: ${document.querySelectorAll("form.preference-expansion-section").length}`);

  const sectionResults = [];
  for (let i = sectionIndex; i < SECTIONS.length; i++) {
    const section = SECTIONS[i];
    chrome.runtime.sendMessage({ type: "NOTIF_PREFS_PROGRESS", sectionName: section.sectionName });
    const result = await processSection(section.sectionName, section.groups, email, (r) =>
      chrome.runtime.sendMessage({ type: "NOTIF_PREFS_SECTION_DONE", sectionResult: r })
    );
    sectionResults.push(result);
    await sleep(300);
  }

  log("All sections processed — done");
  chrome.runtime.sendMessage({ type: "NOTIF_PREFS_MARKET_DONE", sectionResults });
})();
