/**
 * shipping_template_automator.js
 * Amazon Seller Central EU — Shipping Template Automation
 * Chrome Extension Content Script
 *
 * Supported rate model : shipment_based (Per Item / Weight-Based)
 * Supported sections   : Domestic + International (Standard + Expedited)
 *
 * Usage (from background / popup via chrome.scripting.executeScript):
 *
 *   window.__runShippingTemplateAutomation(config).catch(console.error);
 *
 * or paste directly into DevTools console on the template creation page.
 */

(() => {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────

  const LOG  = "[ShippingTemplate]";
  const T    = 15_000;   // default wait timeout (ms)
  const POLL = 150;      // polling interval  (ms)

  /**
   * Maps config transitTime strings → dropdown option values used by Amazon.
   * Extend as needed.
   */
  const TRANSIT_VALUE = {
    "0-0D":   "0_0",
    "1-2D":   "1_2",
    "2-3D":   "2_3",
    "3-5D":   "3_5",
    "5-7D":   "5_7",
    "7-10D":  "7_10",
    "10-14D": "10_14",
    "14+D":   "14_99",
  };

  /**
   * Maps config unitMeasure strings → <option value> used by Amazon.
   */
  const UNIT_MEASURE_VALUE = {
    // Keys = config values, Values = actual Amazon <option value> attributes
    // Confirmed from live DOM: option values are human-readable strings, not snake_case
    "Per Item":      "Per Item",
    "Per Kilogram":  "Per Kilo",
    "Per Pound":     "Per Pound",
    // Legacy/fallback mappings in case page uses snake_case on some markets
    "per_item":      "Per Item",
    "per_kg":        "Per Kilo",
    "per_lb":        "Per Pound",
  };

  /**
   * EU service type IDs that are ALWAYS enabled — never click their checkbox.
   */
  const ALWAYS_ENABLED = new Set(["EU_STANDARD.DOMESTIC"]);

  // ─────────────────────────────────────────────────────────────────────────
  // LOGGING — all entries buffered for auto-download at completion
  // ─────────────────────────────────────────────────────────────────────────

  const _logBuffer = [];

  function _bufferLine(level, msg, args) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
    const extra = args.length
      ? args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")
      : "";
    _logBuffer.push(`[${ts}] [${level}] ${msg}${extra ? " " + extra : ""}`);
  }

  function log(msg, ...args)  {
    console.log(`${LOG} ${msg}`,  ...args);
    _bufferLine("LOG",  msg, args);
  }
  function warn(msg, ...args) {
    console.warn(`${LOG} ${msg}`, ...args);
    _bufferLine("WARN", msg, args);
  }

  function assertFound(el, description, contextEl = null) {
    if (!el) {
      if (contextEl) {
        log(`assertFound: context HTML for missing "${description}":\n${contextEl.outerHTML.slice(0, 800)}`);
      }
      throw new Error(`${LOG} Not found: ${description}`);
    }
    return el;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // withRetry
  // Runs `fn` up to `maxRetries + 1` times. On each failure except the last,
  // logs the error and waits 800 ms before retrying.
  // ─────────────────────────────────────────────────────────────────────────

  async function withRetry(fn, label, maxRetries = 2) {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt <= maxRetries) {
          warn(`withRetry [${label}] attempt ${attempt} failed — retrying in 800ms... (${err.message})`);
          await sleep(800);
        }
      }
    }
    log(`withRetry [${label}] all ${maxRetries + 1} attempt(s) failed.`);
    throw lastErr;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SLEEP / TIMING
  // ─────────────────────────────────────────────────────────────────────────

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ─────────────────────────────────────────────────────────────────────────
  // waitForElement
  // Resolves with the first element matching `selector` inside `root`.
  // Rejects after `timeout` ms if nothing appears.
  // ─────────────────────────────────────────────────────────────────────────

  function waitForElement(selector, { root = document, timeout = T } = {}) {
    return new Promise((resolve, reject) => {
      const el = root.querySelector(selector);
      if (el) return resolve(el);

      const tid = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`${LOG} waitForElement timeout: "${selector}"`));
      }, timeout);

      const obs = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (found) {
          clearTimeout(tid);
          obs.disconnect();
          resolve(found);
        }
      });

      const target = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
      obs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "hidden"] });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // waitForCondition
  // Polls `condFn` every POLL ms until it returns truthy or timeout is reached.
  // ─────────────────────────────────────────────────────────────────────────

  function waitForCondition(condFn, { timeout = T, label = "condition" } = {}) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const v = await condFn();
          if (v) return resolve(v);
        } catch (_) { /* keep polling */ }
        if (Date.now() - start >= timeout) {
          return reject(new Error(`${LOG} waitForCondition timeout: ${label}`));
        }
        setTimeout(tick, POLL);
      };
      tick();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setNativeValue
  // Sets value on a React-controlled input/select and fires synthetic events
  // so the framework picks up the change.
  // ─────────────────────────────────────────────────────────────────────────

  function setNativeValue(el, value) {
    const proto   = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter  = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // clickAndWait
  // Clicks an element and waits `ms` for the UI to react.
  // ─────────────────────────────────────────────────────────────────────────

  async function clickAndWait(el, ms = 400) {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.click();
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true }));
    await sleep(ms);
  }

  // ── Amazon a-checkbox click ──
  // Amazon's custom checkboxes (class="a-checkbox") require clicking the <label>
  // to trigger cascade JS handlers (e.g. parent → children selection).
  // Clicking the hidden <input> directly changes the DOM state but does NOT
  // fire the cascade, so parent checkboxes like IT0 won't select their children.
  async function clickACheckbox(cbInput, ms = 60) {
    const lbl = cbInput.closest("label")
      || (cbInput.id
          ? [...document.querySelectorAll("label")].find((l) => l.htmlFor === cbInput.id)
          : null);
    (lbl || cbInput).click();
    await sleep(ms);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the currently visible .a-popover-modal, or null.
   * Amazon renders multiple hidden modals in the DOM simultaneously;
   * we detect visibility by style and computed display.
   */
  function getVisibleModal() {
    // Amazon popover modals: .a-popover[style*="display: block"] or similar
    // Confirmed from live DOM: modal element has class "a-popover-modal" only.
    // The compound ".a-popover.a-popover-modal" would never match — removed.
    const selectors = [
      '.a-popover-modal[style*="display: block"]',
      '.a-popover-modal[style*="display:block"]',
      '[role="dialog"].a-popover-modal',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && getComputedStyle(el).display !== "none") return el;
    }
    // Fallback: any .a-popover-modal that is not hidden
    for (const el of document.querySelectorAll(".a-popover-modal")) {
      const style = el.getAttribute("style") || "";
      if (!style.includes("display: none") && !style.includes("display:none") && !el.hidden) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
      }
    }
    return null;
  }

  /**
   * Waits until a modal is visible. Rejects after `timeout` ms.
   */
  function waitForModal(timeout = 10_000) {
    return waitForCondition(() => getVisibleModal(), { timeout, label: "visible modal" });
  }

  /**
   * Finds and clicks the OK / Save button inside a modal, then waits for it to close.
   */
  async function confirmModal(modal) {
    log("confirmModal: waiting for OK button...");

    // Step 1 — synchronous scan across all known OK button patterns.
    // The modal is already open so the button is almost always in the DOM immediately.
    // We check all selectors without waiting to avoid the 5-second timeout penalty.
    let btn = (
      modal.querySelector("#submitButtonInPopup-announce")              ||
      modal.querySelector("#submitButtonInPopupWithCheckBox-announce")  ||  // "Remove Region" modal
      modal.querySelector("#submitButtonInPopup button")                ||
      modal.querySelector("#submitButtonInPopupWithCheckBox button")    ||
      modal.querySelector(".a-button-primary button")                   ||
      modal.querySelector("button[type='submit']")                      ||
      [...modal.querySelectorAll("button")]
        .find((b) => /^(ok|save|confirm|done)$/i.test(b.textContent.trim()))
    );

    // Step 2 — if not found synchronously, wait briefly for late-rendering buttons
    // (e.g. rate model modal where the button renders a few ms after the modal opens).
    if (!btn) {
      log("confirmModal: button not found synchronously — waiting up to 2s...");
      btn = await waitForElement(
        [
          "#submitButtonInPopup-announce",
          "#submitButtonInPopup button",
          ".a-button-primary button",
          "button[type='submit']",
        ].join(", "),
        { root: modal, timeout: 2_000 }
      ).catch(() => null);
    }

    assertFound(btn, "OK button in modal (no matching selector found)");

    log("confirmModal: clicking OK button", btn.id);

    // Use native .click() — generates isTrusted:true which Amazon AUI requires.
    // dispatchEvent(new MouseEvent(...)) produces isTrusted:false and is ignored.
    btn.click();

    // Give AUI handler time to process and start closing the modal
    await sleep(400);

    // If modal is still visible, try clicking the parent wrapper span as well —
    // Amazon AUI sometimes binds the handler to .a-button rather than the inner button.
    if (getVisibleModal()) {
      log("confirmModal: modal still visible — clicking parent wrapper...");
      const wrapper = modal.querySelector("#submitButtonInPopup") ||
                      modal.querySelector(".a-button-primary");
      if (wrapper) wrapper.click();
      await sleep(300);
    }

    // Wait for the modal to close.
    // Amazon does NOT remove the modal from DOM — it hides it via display:none / aria-hidden.
    // getVisibleModal() checks computed style and BoundingClientRect, so it handles this correctly.
    await waitForCondition(
      () => !getVisibleModal(),
      { timeout: 8_000, label: "modal closed/hidden after OK" }
    );

    log("confirmModal: modal closed.");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setTemplateName
  // ─────────────────────────────────────────────────────────────────────────

  async function setTemplateName(name) {
    log("STEP: setTemplateName");
    return withRetry(async () => {
      log(`setTemplateName → "${name}"`);

      // #templateNameInput confirmed present on live page
      const input = await waitForElement(
        [
          "#templateNameInput",
          "input[name='templateName']",
          "input[id='templateName']",
          "input[aria-label*='template name' i]",
          "input[placeholder*='template name' i]",
        ].join(", ")
      );

      log(`setTemplateName: input found (id="${input.id}", name="${input.name}")`);
      // Single setNativeValue call — do NOT clear first.
      // Amazon's Backbone handler fires once per input/change event.
      // Calling setNativeValue("") then setNativeValue(name) causes the handler
      // to process the empty string and ignore the second call.
      input.focus();
      setNativeValue(input, name);
      input.blur();

      log(`Template name set: "${name}"`);
    }, `setTemplateName("${name}")`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setRateModel
  // Only "shipment_based" is supported.
  // ─────────────────────────────────────────────────────────────────────────

  async function setRateModel(model) {
    log("STEP: setRateModel");
    log(`setRateModel → "${model}"`);

    if (model !== "shipment_based") {
      throw new Error(`${LOG} setRateModel: unsupported model "${model}" — only "shipment_based" is supported.`);
    }

    // input[name='rateModel'] confirmed present on live page.
    // Value for shipment_based may be "shipment_based", "per-item", or similar —
    // we select by name first, then match the right option by value/text.
    const allRateRadios = [...document.querySelectorAll("input[name='rateModel']")];

    if (allRateRadios.length === 0) {
      warn("setRateModel: no input[name='rateModel'] found — page may default to shipment_based. Continuing.");
      return;
    }

    log(`setRateModel: found ${allRateRadios.length} radio(s) for rateModel.`);

    // Find the shipment_based radio: check value, then label text
    const radio = (
      allRateRadios.find((r) => r.value === "shipment_based") ||
      allRateRadios.find((r) => /shipment/i.test(r.value)) ||
      allRateRadios.find((r) => {
        const lbl = document.querySelector(`label[for='${r.id}']`);
        return lbl && /per.item|shipment/i.test(lbl.textContent);
      })
    );

    if (!radio) {
      throw new Error(
        `${LOG} setRateModel: could not identify shipment_based radio. ` +
        `Values found: [${allRateRadios.map((r) => r.value).join(", ")}]`
      );
    }

    log(`setRateModel: targeting radio value="${radio.value}" id="${radio.id}"`);

    if (!radio.checked) {
      await clickAndWait(radio, 400);
      log("Rate model radio clicked — checking for confirmation modal...");

      // Amazon shows a "Change Rate Model?" confirmation modal after clicking
      // a different rate model.
      // Confirmed DOM class from live page: "a-popover-modal" (NOT "a-popover").
      // Detection by [role="dialog"].a-popover-modal — do NOT rely on display,
      // opacity or aria-hidden as these are unreliable during animations.
      log("Waiting for rate model confirmation modal...");

      const rateModelModal = await waitForCondition(
        () => document.querySelector('[role="dialog"].a-popover-modal'),
        { timeout: 4_000, label: "rate model confirmation modal" }
      ).catch(() => null); // modal is optional — some flows skip it

      if (rateModelModal) {
        log("Modal detected (role=dialog) — confirming via confirmModal...");
        await confirmModal(rateModelModal);
        log("Rate model change confirmed.");
      } else {
        log("No confirmation modal detected — rate model change applied directly.");
      }

      // Wait until a shipment_based radio is confirmed checked in the DOM.
      // Re-query fresh — the original `radio` reference may be stale after Amazon's DOM re-render.
      await waitForCondition(
        () => {
          const fresh = (
            document.querySelector(`input[name='rateModel'][value='${radio.value}']`) ||
            document.querySelector("input[name='rateModel'][value='shipment_based']") ||
            document.querySelector("input[name='rateModel']:checked")
          );
          return fresh && fresh.checked;
        },
        { timeout: 5_000, label: "rateModel radio confirmed checked" }
      ).catch(() => log("setRateModel: radio.checked soft-failed (stale ref?) — continuing."));

      // Wait until service_type checkboxes are present — confirms the shipping
      // section UI has re-rendered and region rows can now be created.
      await waitForCondition(
        () => !!document.querySelector("input[name='service_type']"),
        { timeout: 8_000, label: "service_type checkboxes present after rateModel change" }
      );

      // Amazon re-renders the entire shipping table after a rate model change.
      // All previously captured DOM references (rows, inputs) are now stale.
      // Wait until at least one shippingTime select is present — this confirms
      // that existing region rows have been re-rendered with fresh DOM nodes.
      log("setRateModel: waiting for DOM re-render (shippingTime selects)...");
      await waitForCondition(
        () => document.querySelector("select[name='shippingTime']") !== null,
        { timeout: 8_000, label: "shippingTime selects present after re-render" }
      ).catch(() => {
        log("setRateModel: shippingTime not found after re-render — template may have no rows yet. Continuing.");
      });

      log("Rate model confirmed — DOM re-render complete, shipping sections are ready.");
    } else {
      log("Rate model already set to shipment_based — skipping click.");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // toggleSSA
  // Seller Fulfilled Prime / SSA toggle. Silently skips if not found.
  // ─────────────────────────────────────────────────────────────────────────

  async function toggleSSA(enabled) {
    log(`toggleSSA → ${enabled}`);

    const toggle = (
      document.querySelector("input[name='ssaEnabled']") ||
      document.querySelector("input[name='ssa_enabled']") ||
      document.querySelector("input[id*='ssa']") ||
      document.querySelector("input[id*='SSA']") ||
      document.querySelector("input[aria-label*='prime' i]") ||
      document.querySelector("input[aria-label*='SSA' i]")
    );

    if (!toggle) {
      warn("SSA toggle not found — skipping.");
      return;
    }

    if (toggle.checked !== enabled) {
      await clickAndWait(toggle, 400);
      log(`SSA toggled to: ${enabled}`);
    } else {
      log(`SSA already in desired state (${enabled}).`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enableServiceType
  // Clicks the service type checkbox to enable it (skips ALWAYS_ENABLED types).
  // ─────────────────────────────────────────────────────────────────────────

  async function enableServiceType(serviceTypeId) {
    log(`enableServiceType → "${serviceTypeId}"`);

    if (ALWAYS_ENABLED.has(serviceTypeId)) {
      log(`"${serviceTypeId}" is always enabled — skipping checkbox.`);
      return;
    }

    const checkbox = document.querySelector(
      `input[name='service_type'][value='${serviceTypeId}']`
    );

    if (!checkbox) {
      // Some service types use the ID instead of value
      const byId = document.querySelector(`input[id='${serviceTypeId}']`);
      if (!byId) {
        throw new Error(`${LOG} enableServiceType: checkbox not found for "${serviceTypeId}"`);
      }
      if (byId.disabled) {
        warn(`"${serviceTypeId}" checkbox is disabled — skipping.`);
        return;
      }
      if (!byId.checked) {
        await clickAndWait(byId, 700);
      }
      return;
    }

    if (checkbox.disabled) {
      warn(`"${serviceTypeId}" checkbox is disabled — skipping.`);
      return;
    }

    if (!checkbox.checked) {
      await clickAndWait(checkbox, 700);
      log(`"${serviceTypeId}" enabled.`);
    } else {
      log(`"${serviceTypeId}" already enabled.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // disableServiceType
  // Unchecks the service type checkbox (skips ALWAYS_ENABLED types).
  // Used to clear the checkbox when a section ends up with 0 rows.
  // ─────────────────────────────────────────────────────────────────────────

  async function disableServiceType(serviceTypeId) {
    log(`disableServiceType → "${serviceTypeId}"`);

    if (ALWAYS_ENABLED.has(serviceTypeId)) {
      log(`"${serviceTypeId}" is always enabled — cannot uncheck.`);
      return;
    }

    const checkbox =
      document.querySelector(`input[name='service_type'][value='${serviceTypeId}']`) ||
      document.querySelector(`input[id='${serviceTypeId}']`);

    if (!checkbox) {
      warn(`disableServiceType: checkbox not found for "${serviceTypeId}" — skipping.`);
      return;
    }

    if (checkbox.disabled) {
      warn(`"${serviceTypeId}" checkbox is disabled — cannot uncheck.`);
      return;
    }

    if (checkbox.checked) {
      await clickAndWait(checkbox, 700);
      log(`"${serviceTypeId}" disabled (unchecked).`);
    } else {
      log(`"${serviceTypeId}" already unchecked.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getSectionRoot
  // Locates the DOM container that owns a given service type's rows.
  // Tries data attributes → id fragments → aria-label → text heuristics.
  // ─────────────────────────────────────────────────────────────────────────

  function getSectionRoot(serviceTypeId) {
    // ── Primary: find the "Add Rule" button for this service type ──
    // Amazon renders a button with id="${serviceTypeId}_addRuleButton-announce"
    // for every service type section. Walking up from it gives the correct section root.
    const addRuleBtn = (
      document.getElementById(`${serviceTypeId}_addRuleButton-announce`) ||
      document.getElementById(`${serviceTypeId}_addRuleButton`)
    );
    if (addRuleBtn) {
      // Walk up from the addRuleButton tracking two candidates:
      //   rowsRoot  — tightest block container that has rows AND no conflicts
      //               (correct root for sections that already have region rows)
      //   lastSafe  — largest block container reached before hitting a container
      //               that also contains other service types' addRuleButtons
      //               (fallback root for newly-enabled empty sections, e.g. intl)
      //
      // We skip AUI inline wrapper elements (span, a, button, label) to avoid
      // returning the button's own wrapper span as the section root.
      const INLINE_TAGS = new Set(['span', 'a', 'button', 'label', 'input', 'select']);
      let el = addRuleBtn.parentElement;
      let rowsRoot = null;
      let lastSafe  = null;
      while (el && el !== document.body) {
        if (!INLINE_TAGS.has(el.tagName.toLowerCase())) {
          const otherAddBtns = [...el.querySelectorAll("[id*='_addRuleButton']")]
            .filter((b) => b !== addRuleBtn && !b.id.startsWith(serviceTypeId));
          if (otherAddBtns.length > 0) break; // crossed into a shared container — stop
          lastSafe = el; // widest container still scoped only to this service type
          if (!rowsRoot && el.querySelector("tbody > tr, tr[data-region], [data-region-row]")) {
            rowsRoot = el; // tightest container that also has rows
          }
        }
        el = el.parentElement;
      }
      const tightRoot = rowsRoot || lastSafe;

      const root = tightRoot ||
        addRuleBtn.parentElement?.parentElement?.parentElement ||
        addRuleBtn.parentElement;

      log(`getSectionRoot: found via addRuleButton for "${serviceTypeId}" (tag="${root?.tagName}", id="${root?.id}", tight=${!!tightRoot})`);
      return root;
    }

    // ── Fallback: data-attribute match ──
    const byData = (
      document.querySelector(`[data-service-type-id='${serviceTypeId}']`) ||
      document.querySelector(`[data-service-type='${serviceTypeId}']`) ||
      document.querySelector(`[data-group-id='${serviceTypeId}']`) ||
      document.querySelector(`[data-group='${serviceTypeId}']`)
    );
    if (byData) return byData;

    // ── Fallback: ID fragment — but EXCLUDE popover/modal containers ──
    // div#EU_STANDARD.DOMESTIC_region_selector is inside a popover (a-popover-preload)
    // and does NOT contain the region rows or the Add button — skip it.
    const byIdCandidates = [...document.querySelectorAll(`[id*='${serviceTypeId}']`)].filter((el) => {
      // Skip elements inside a popover preload or hidden modal container
      if (el.closest("[id*='a-popover']") || el.closest("[class*='a-popover']")) return false;
      if (el.closest("[class*='popover-preload']") || el.id.includes("region_selector")) return false;
      return true;
    });
    if (byIdCandidates.length > 0) {
      const byId = byIdCandidates[0];
      return byId.closest("section, article, [class*='section'], [class*='panel'], table, tbody") || byId;
    }

    // ── Fallback: checkbox ancestor ──
    const checkbox = document.querySelector(
      `input[name='service_type'][value='${serviceTypeId}'], input[id='${serviceTypeId}']`
    );
    if (checkbox) {
      return checkbox.closest(
        "section, article, [class*='shipping-type'], [class*='service-type'], " +
        "[class*='section-container'], [class*='rate-section'], tbody, table"
      ) || checkbox.parentElement;
    }

    warn(`getSectionRoot: no root found for "${serviceTypeId}"`);
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getRegionRows
  // Returns all region data-rows inside a section root.
  // ─────────────────────────────────────────────────────────────────────────

  function getRegionRows(sectionRoot) {
    // Guard: refuse to scan the entire document body — sectionRoot must be a real section
    if (!sectionRoot || sectionRoot === document.body || sectionRoot === document.documentElement) {
      return [];
    }

    return [
      ...sectionRoot.querySelectorAll(
        "tr[data-region-row], tr[data-region], [data-region-row], [data-region], tbody > tr"
      ),
    ].filter((tr) => {
      // Exclude rows inside <thead>
      if (tr.closest("thead")) return false;
      // Exclude rows that are entirely <th> cells (column headers in <tbody>)
      const cells = tr.cells ? [...tr.cells] : [...tr.querySelectorAll("td, th")];
      if (cells.length > 0 && cells.every((c) => c.tagName === "TH")) return false;
      // Must contain at least one interactive or content element to be a real region row
      if (!tr.querySelector("input, select, a, button, td")) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setTransitTime
  // Sets the transit time dropdown on a region row.
  // If no dropdown exists (fixed value), logs a warning and continues.
  // ─────────────────────────────────────────────────────────────────────────

  async function setTransitTime(row, transitTime) {
    log("STEP: setTransitTime");
    return withRetry(async () => {
      log(`setTransitTime → "${transitTime}"`);

      // select[name='shippingTime'] confirmed present on live page (scoped to row)
      const sel = (
        row.querySelector("select[name='shippingTime']")     ||
        row.querySelector("select[name='transitTime']")      ||
        row.querySelector("select[name='transit_time']")     ||
        row.querySelector("select[aria-label*='transit' i]") ||
        row.querySelector("select[aria-label*='shipping time' i]")
      );

      if (!sel) {
        warn(`setTransitTime: no dropdown found in row — transit time may be fixed. Skipping.`);
        log(`setTransitTime: row outerHTML:\n${row.outerHTML.slice(0, 800)}`);
        return;
      }

      log(`setTransitTime: select found (name="${sel.name}", id="${sel.id}")`);

      const targetValue = TRANSIT_VALUE[transitTime] ?? transitTime;
      const allOptions  = [...sel.options];

      // ── Pass 1: exact match by mapped value or raw string or text ──
      let option = (
        allOptions.find((o) => o.value === targetValue) ||
        allOptions.find((o) => o.value === transitTime) ||
        allOptions.find((o) => o.text.replace(/\s/g, "").includes(String(transitTime).replace(/\s/g, "")))
      );

      // ── Pass 2: numeric range match ──
      // Accepts plain numbers or "Nd" (e.g. 3, "3", "3D").
      // Parses each option's value (format "N_M") and picks the tightest
      // interval [min, max] that contains the given number.
      // Ties broken by smallest range, then smallest max.
      if (!option) {
        const numericInput = (() => {
          if (typeof transitTime === "number") return transitTime;
          const m = String(transitTime).match(/^(\d+)D?$/i);
          return m ? parseInt(m[1], 10) : null;
        })();

        if (numericInput !== null) {
          const parseRange = (val) => {
            const m = val.match(/^(\d+)_(\d+)$/);
            return m ? { min: parseInt(m[1], 10), max: parseInt(m[2], 10) } : null;
          };

          const candidates = allOptions
            .map((o) => ({ o, r: parseRange(o.value) }))
            .filter(({ r }) => r && numericInput >= r.min && numericInput <= r.max)
            .sort((a, b) => {
              const da = a.r.max - a.r.min, db = b.r.max - b.r.min;
              return da !== db ? da - db : a.r.max - b.r.max;
            });

          if (candidates.length > 0) {
            option = candidates[0].o;
            log(`setTransitTime: numeric ${numericInput}D → range-matched "${option.text}" (value="${option.value}")`);
          }
        }
      }

      if (!option) {
        throw new Error(
          `${LOG} setTransitTime: option "${transitTime}" not found. ` +
          `Available: [${allOptions.map((o) => `${o.value}="${o.text}"`).join(", ")}]`
        );
      }

      // Idempotency: skip if already set to desired value
      if (sel.value === option.value) {
        log(`setTransitTime: already set to "${option.text}" (value="${option.value}") — skipping.`);
        return;
      }

      setNativeValue(sel, option.value);
      log(`Transit time set → "${option.text}" (value="${option.value}")`);
      await sleep(150);
    }, `setTransitTime("${transitTime}")`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setPricing
  // Fills pricePerOrder, unitPrice, unitMeasure on a region row.
  // Only shipment_based pricing is supported.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * setPricing — ALL queries are scoped to `row` via waitForElement({ root: row }).
   *
   * IMPORTANT: pricing inputs (pricePerOrder, unitPrice, unitMeasure) are
   * dynamically rendered per region row ONLY after:
   *   1. rateModel is set to shipment_based
   *   2. a region row has been created
   *
   * Never call this function before the row exists in the DOM.
   */
  async function setPricing(row, pricing) {
    log("STEP: setPricing");
    return withRetry(async () => {
      log("setPricing: starting — scoping all queries to row element");
      log("setPricing: pricing config =", JSON.stringify(pricing));

      if (pricing.model !== "shipment_based") {
        throw new Error(`${LOG} setPricing: unsupported model "${pricing.model}"`);
      }

      // ── pricePerOrder ──
      // Confirmed NOT available globally — only rendered inside region row.
      // Use waitForElement scoped to row to handle any remaining render delay.
      log("setPricing: waiting for pricePerOrder input inside row...");
      const pricePerOrderEl = await waitForElement(
        [
          "input[name='pricePerOrder']",
          "input[name='price_per_order']",
          "input[name*='PerOrder']",
          "input[aria-label*='per order' i]",
          "input[aria-label*='per shipment' i]",
        ].join(", "),
        { root: row, timeout: 8_000 }
      ).catch(() => null);

      if (!pricePerOrderEl) {
        log(`setPricing: pricePerOrder not found — row outerHTML:\n${row.outerHTML.slice(0, 800)}`);
        throw new Error(
          `${LOG} setPricing: pricePerOrder input not found inside region row — ` +
          `check DOM structure. Ensure rateModel=shipment_based is set and region row is rendered.`
        );
      }
      log(`setPricing: pricePerOrder found (name="${pricePerOrderEl.name}", id="${pricePerOrderEl.id}")`);
      if (pricePerOrderEl.value === String(pricing.pricePerOrder)) {
        log(`setPricing: pricePerOrder already "${pricing.pricePerOrder}" — skipping.`);
      } else {
        pricePerOrderEl.focus();
        setNativeValue(pricePerOrderEl, String(pricing.pricePerOrder));
        pricePerOrderEl.blur();
        await sleep(120);
      }

      // ── unitPrice ──
      log("setPricing: waiting for unitPrice input inside row...");
      const unitPriceEl = await waitForElement(
        [
          "input[name='unitPrice']",
          "input[name='unit_price']",
          "input[name*='UnitPrice']",
          "input[aria-label*='unit price' i]",
        ].join(", "),
        { root: row, timeout: 8_000 }
      ).catch(() => null);

      if (!unitPriceEl) {
        log(`setPricing: unitPrice not found — row outerHTML:\n${row.outerHTML.slice(0, 800)}`);
        throw new Error(
          `${LOG} setPricing: unitPrice input not found inside region row — check DOM structure.`
        );
      }
      log(`setPricing: unitPrice found (name="${unitPriceEl.name}", id="${unitPriceEl.id}")`);
      if (unitPriceEl.value === String(pricing.unitPrice)) {
        log(`setPricing: unitPrice already "${pricing.unitPrice}" — skipping.`);
      } else {
        unitPriceEl.focus();
        setNativeValue(unitPriceEl, String(pricing.unitPrice));
        unitPriceEl.blur();
        await sleep(120);
      }

      // ── unitMeasure ──
      log("setPricing: waiting for unitMeasure select inside row...");
      const unitMeasureEl = await waitForElement(
        [
          "select[name='unitMeasure']",
          "select[name='unit_measure']",
          "select[name*='UnitMeasure']",
          "select[aria-label*='unit measure' i]",
          "select[aria-label*='per item' i]",
        ].join(", "),
        { root: row, timeout: 8_000 }
      ).catch(() => null);

      if (!unitMeasureEl) {
        log(`setPricing: unitMeasure not found — row outerHTML:\n${row.outerHTML.slice(0, 800)}`);
        throw new Error(
          `${LOG} setPricing: unitMeasure select not found inside region row — check DOM structure.`
        );
      }
      log(`setPricing: unitMeasure found (name="${unitMeasureEl.name}", id="${unitMeasureEl.id}")`);

      const targetMeasure = UNIT_MEASURE_VALUE[pricing.unitMeasure] ?? pricing.unitMeasure;
      const measureOption = (
        [...unitMeasureEl.options].find((o) => o.value === targetMeasure) ||
        [...unitMeasureEl.options].find((o) => o.text.trim() === pricing.unitMeasure)
      );
      if (!measureOption) {
        throw new Error(
          `${LOG} setPricing: unitMeasure option "${pricing.unitMeasure}" not found. ` +
          `Available: [${[...unitMeasureEl.options].map((o) => `${o.value}="${o.text}"`).join(", ")}]`
        );
      }
      if (unitMeasureEl.value === measureOption.value) {
        log(`setPricing: unitMeasure already "${pricing.unitMeasure}" — skipping.`);
      } else {
        setNativeValue(unitMeasureEl, measureOption.value);
        await sleep(150);
      }

      log(`setPricing: complete — pricePerOrder=${pricing.pricePerOrder}, unitPrice=${pricing.unitPrice}, unitMeasure="${pricing.unitMeasure}"`);
    }, `setPricing(pricePerOrder=${pricing.pricePerOrder}, unitPrice=${pricing.unitPrice})`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // expandCollapsedGroups
  // Finds all collapsed expandable section headers inside `root` and clicks
  // them to reveal their children.
  //
  // Amazon SC country modals use collapsible continent/region groups.
  // These are identified by aria-expanded="false" on buttons, links, or
  // role="button" spans, and by Amazon-specific accordion class patterns.
  // ─────────────────────────────────────────────────────────────────────────

  async function expandCollapsedGroups(_root, serviceTypeId = null) {
    // Confirmed DOM structure (Amazon SC international region tree):
    //
    //   <div class="jurisdiction">
    //     <input class="level_3 jurisdiction" id="...~PRG5">  ← group checkbox
    //     <div class="toggle">                                 ← EXPAND TOGGLE (click this)
    //       <div class="jurisdiction_text">
    //         <div class="jurisdiction_name">EU Countries</div>
    //         <i class="a-icon a-icon-section-expand">         ← expand icon
    //       </div>
    //     </div>
    //     <div class="list_level_4 jurisdiction_list">         ← empty until expanded
    //       … individual country checkboxes rendered here …
    //     </div>
    //   </div>
    //
    // The modal renders TWO copies of the international tree (one per service type
    // instance). A document-wide querySelectorAll finds BOTH "EU Countries" toggles,
    // so clicking all of them: click1=expand, click2=collapse → net: still collapsed.
    // Fix: when serviceTypeId is provided, navigate from the PRG* checkboxes that
    // belong to that specific service type — each has exactly one parent div.jurisdiction
    // with exactly one div.toggle. This gives us only the right toggle.

    const toExpand = new Set();

    if (serviceTypeId) {
      // Targeted: PRG* checkboxes → parent div.jurisdiction → div.toggle
      const prgCbs = [...document.querySelectorAll(`input[id^='${serviceTypeId}~PRG']`)];
      log(`expandCollapsedGroups: ${prgCbs.length} PRG* checkbox(es) for "${serviceTypeId}"`);
      for (const cb of prgCbs) {
        const jurisdiction = cb.parentElement;
        if (!jurisdiction) continue;
        const toggle = jurisdiction.querySelector("div.toggle");
        if (!toggle) continue;
        if (toggle.querySelector("i.a-icon-section-expand")) {
          const lbl = toggle.querySelector(".jurisdiction_name")?.textContent.trim() || cb.id;
          log(`  queuing "${lbl}"`);
          toExpand.add(toggle);
        }
      }
      log(`expandCollapsedGroups: ${toExpand.size} targeted toggle(s) to expand`);
    }

    // Fallback: document-wide icon scan (used when no serviceTypeId given)
    if (toExpand.size === 0) {
      for (const icon of document.querySelectorAll("i.a-icon-section-expand")) {
        const toggle = icon.closest("div.toggle");
        if (toggle) toExpand.add(toggle);
      }
      log(`expandCollapsedGroups: fallback icon-scan found ${toExpand.size} toggle(s)`);
    }

    if (toExpand.size === 0) {
      log("expandCollapsedGroups: no collapsed groups — tree already fully expanded.");
      return;
    }

    log(`expandCollapsedGroups: expanding ${toExpand.size} group(s)...`);
    for (const toggle of toExpand) {
      const label = toggle.querySelector(".jurisdiction_name")?.textContent.trim()
                  || toggle.textContent.trim().slice(0, 30) || "(unlabeled)";
      log(`  expanding: "${label}"`);
      toggle.click();
      await sleep(600);
    }
    await sleep(800);
    log("expandCollapsedGroups: done.");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // findCheckboxInModal
  // Tries to locate a country checkbox by value or id, then by label text.
  // If not found on first attempt, expands any remaining collapsed groups
  // inside the modal and retries once.
  // ─────────────────────────────────────────────────────────────────────────

  async function findCheckboxInModal(modal, value, code) {
    // ── Helper: single lookup pass (no expansion) ──
    const lookup = () => {
      // 1. By id — Amazon uses id (not value) for country checkboxes; value is always "on".
      //    Use getElementById (no CSS escaping issues with dots/tildes).
      const byIdDirect = document.getElementById(value);
      if (byIdDirect && byIdDirect.type === "checkbox") return byIdDirect;

      // 2. By value attribute (fallback for non-Amazon implementations)
      const byValue = modal.querySelector(`input[type='checkbox'][value='${CSS.escape(value)}']`);
      if (byValue) return byValue;

      // 3. By id via attribute selector (belt-and-suspenders)
      try {
        const byId = modal.querySelector(`input[type='checkbox'][id='${CSS.escape(value)}']`);
        if (byId) return byId;
      } catch (_) { /* ignore invalid selector */ }

      // 3. By data attributes — some service types store region code in data-*
      const byData = (
        modal.querySelector(`input[type='checkbox'][data-value='${value}']`) ||
        modal.querySelector(`input[type='checkbox'][data-country='${code}']`) ||
        modal.querySelector(`input[type='checkbox'][data-region='${code}']`) ||
        modal.querySelector(`input[type='checkbox'][data-id='${value}']`)
      );
      if (byData) return byData;

      // 4. By associated label text — exact match on country code,
      //    or label whose text contains the code as a whole word.
      //    Also handles labels whose text is the full country name if
      //    the code itself doesn't appear as a standalone token.
      for (const lbl of modal.querySelectorAll("label")) {
        const text = lbl.textContent.trim();
        // Exact match or code appears as its own token in the label
        const codePattern = new RegExp(`(?:^|\\s|\\()${code}(?:\\s|\\)|$)`);
        if (text === code || codePattern.test(text)) {
          const forId = lbl.getAttribute("for");
          if (forId) {
            const linked = modal.querySelector(`input[type='checkbox'][id='${forId}']`);
            if (linked) return linked;
          }
          // Label wraps the input directly
          const wrapped = lbl.querySelector("input[type='checkbox']");
          if (wrapped) return wrapped;
        }
      }

      return null;
    };

    // ── Pass 1: direct lookup ──
    const firstTry = lookup();
    if (firstTry) return firstTry;

    // ── Pass 2: expand PRG sub-groups ONE AT A TIME and check immediately ──
    // Amazon uses accordion behavior: expanding one sub-group collapses others.
    // We must NOT expand all groups at once — instead try each group and stop
    // as soon as the country checkbox becomes visible.
    log(`findCheckboxInModal: "${code}" not found — trying per-group expansion...`);
    const inferredServiceTypeId = value.includes("~") ? value.split("~")[0] : null;
    if (inferredServiceTypeId) {
      const prgCbs = [...document.querySelectorAll(`input[id^='${inferredServiceTypeId}~PRG']`)];
      log(`findCheckboxInModal: ${prgCbs.length} PRG group(s) to try for "${code}"`);
      for (const prgCb of prgCbs) {
        const jurisdiction = prgCb.parentElement;
        if (!jurisdiction) continue;
        const toggle = jurisdiction.querySelector("div.toggle");
        if (!toggle) continue;
        if (!toggle.querySelector("i.a-icon-section-expand")) continue; // already expanded
        const lbl = toggle.querySelector(".jurisdiction_name")?.textContent.trim() || prgCb.id;
        log(`  expanding "${lbl}" (looking for "${code}")...`);
        toggle.click();
        await sleep(800);
        const found = lookup();
        if (found) {
          log(`findCheckboxInModal: "${code}" found after expanding "${lbl}".`);
          return found;
        }
      }
    } else {
      // No serviceTypeId inferred — fall back to full-tree expansion
      await expandCollapsedGroups(modal, null);
      const secondTry = lookup();
      if (secondTry) {
        log(`findCheckboxInModal: "${code}" found after expansion.`);
        return secondTry;
      }
    }

    // ── Pass 3: document-level fallback ──
    // If the rendered checkbox landed outside the modal element (e.g. React portal),
    // search the whole document by value/id. Safe: value includes serviceTypeId prefix.
    const byValueDoc = document.querySelector(`input[type='checkbox'][value='${value}']`);
    if (byValueDoc) {
      log(`findCheckboxInModal: "${code}" found in document (outside modal).`);
      return byValueDoc;
    }
    const byIdDoc = document.querySelector(`input[type='checkbox'][id='${value}']`);
    if (byIdDoc) {
      log(`findCheckboxInModal: "${code}" found in document by id (outside modal).`);
      return byIdDoc;
    }

    // Not found even after expansion + document search
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // editRegionCountries
  // Operates on the already-visible region countries modal.
  // Clears current selection, checks the desired countries.
  // Country checkbox value format: `${serviceTypeId}~${countryCode}`
  //
  // Flow:
  //   1. Expand all collapsed groups upfront (one-time pass)
  //   2. Clear existing selections
  //   3. For each country: findCheckboxInModal (with per-country expand retry)
  //   4. Confirm via OK
  // ─────────────────────────────────────────────────────────────────────────

  async function editRegionCountries(modal, serviceTypeId, countries) {
    log(`editRegionCountries → serviceType="${serviceTypeId}", countries=[${countries.join(", ")}]`);

    // ── Debug: log ALL checkboxes scoped to this serviceTypeId ──
    // NOTE: No upfront full-tree expansion here — Amazon uses accordion behavior.
    // Expanding all groups collapses earlier ones. Per-group expansion is handled
    // inside findCheckboxInModal (Pass 2) when a country is not found immediately.
    // Search modal first; fall back to whole document so we can tell if expansion
    // rendered them outside the modal container (React portal etc.).
    const scopedSelector = `input[type='checkbox'][id^='${serviceTypeId}~'], input[type='checkbox'][value^='${serviceTypeId}~']`;
    const scopedCbs      = [...modal.querySelectorAll(scopedSelector)];
    const scopedDocCbs   = [...document.querySelectorAll(scopedSelector)];
    const scopedOutside  = scopedDocCbs.filter((c) => !scopedCbs.includes(c));
    log(`editRegionCountries: ${scopedCbs.length} scoped cb(s) in modal, ${scopedOutside.length} outside modal`);

    const dumpCb = (c, root) => {
      const forLabel   = c.id ? root.querySelector(`label[for='${c.id}']`) : null;
      const wrapLabel  = c.closest("label");
      const ariaLabel  = c.getAttribute("aria-label") || c.getAttribute("title") || "";
      const ariaBy     = c.getAttribute("aria-labelledby")
        ? (document.getElementById(c.getAttribute("aria-labelledby"))?.textContent.trim() ?? "") : "";
      const container  = c.closest("li, tr, [class*='region'], [class*='row'], [class*='item']");
      const siblingText = container
        ? container.textContent.replace(c.textContent, "").trim().slice(0, 80)
        : (c.nextElementSibling?.textContent.trim().slice(0, 80) ?? "");
      const labelText = forLabel?.textContent.trim() || wrapLabel?.textContent.trim()
        || ariaLabel || ariaBy || siblingText;
      return `  id="${c.id}" val="${c.value}" checked=${c.checked} label="${labelText}"`;
    };

    if (scopedCbs.length > 0) {
      log(`editRegionCountries: scoped cbs in modal:\n${scopedCbs.slice(0, 60).map((c) => dumpCb(c, modal)).join("\n")}`);
    } else if (scopedOutside.length > 0) {
      log(`editRegionCountries: scoped cbs in document (outside modal):\n${scopedOutside.slice(0, 60).map((c) => dumpCb(c, document)).join("\n")}`);
    } else {
      log(`editRegionCountries: WARNING — 0 checkboxes scoped to "${serviceTypeId}" anywhere in document.`);
    }

    // ── Step 2: pre-validate — find all desired checkboxes BEFORE clearing anything ──
    // This prevents the destructive case where we clear existing selections and then
    // discover that none of the desired countries are available/enabled in this section.
    log("editRegionCountries: pre-validating desired countries before clearing...");
    const resolved = [];
    for (const code of countries) {
      const value = `${serviceTypeId}~${code}`;
      const cb = await findCheckboxInModal(modal, value, code);
      if (!cb) {
        warn(`editRegionCountries: "${code}" (value="${value}") not found in modal — will skip.`);
      } else if (cb.disabled) {
        warn(`editRegionCountries: "${code}" checkbox is disabled — will skip. Available options may use a different code for this service type.`);
      } else {
        resolved.push({ code, cb });
      }
    }

    if (resolved.length === 0) {
      // Log all available checkbox info to help diagnose the correct country codes.
      // Captures value, id, data-*, and associated label text.
      const available = [...modal.querySelectorAll("input[type='checkbox']:not(:disabled)")]
        .slice(0, 40)
        .map((c) => {
          const lbl = c.id ? modal.querySelector(`label[for='${c.id}']`) : null;
          const labelText = lbl ? lbl.textContent.trim() : (c.closest("label")?.textContent.trim() ?? "");
          const dataAttrs = [...c.attributes]
            .filter((a) => a.name.startsWith("data-"))
            .map((a) => `${a.name}="${a.value}"`).join(" ");
          return `{val="${c.value}" id="${c.id}" ${dataAttrs} label="${labelText}"}`;
        });
      log(`editRegionCountries: available (non-disabled) checkboxes sample:\n${available.join("\n")}`);

      // Cancel the modal so it doesn't stay open on the page after the error
      const cancelBtn = (
        modal.querySelector(".a-popover-footer .a-button-base button") ||
        modal.querySelector("button[data-action='a-popover-close']")   ||
        [...modal.querySelectorAll("button")]
          .find((b) => /cancel/i.test(b.textContent.trim()))
      );
      if (cancelBtn) {
        log("editRegionCountries: cancelling open modal before throwing...");
        cancelBtn.click();
        await sleep(400);
      }

      throw new Error(
        `${LOG} editRegionCountries: none of the requested countries [${countries.join(", ")}] ` +
        `are selectable in service type "${serviceTypeId}". ` +
        `Check the log for available checkbox values.`
      );
    }

    log(`editRegionCountries: ${resolved.length}/${countries.length} countries validated — proceeding to clear and select.`);

    // ── Step 3: deselect unwanted checkboxes for THIS service type only ──
    // Scope to the current serviceTypeId — the modal DOM accumulates checked
    // checkboxes from ALL previous service type modals in the same session.
    // Those "foreign" checkboxes must NOT influence this service type's save
    // (Amazon's OK handler reads the entire modal DOM, so leaving them checked
    // causes the wrong regions to be saved for EU_STANDARD.DOMESTIC etc.).
    const desiredPrefixes = resolved.map(({ code }) => code.slice(0, 2).toUpperCase());
    const scopedChecked = [...modal.querySelectorAll(
      `input[type='checkbox'][id^='${serviceTypeId}~']:checked:not(:disabled)`
    )];
    const toUncheck = scopedChecked.filter((cb) => {
      const cbCode = (cb.id.includes("~") ? cb.id.split("~")[1] : "").toUpperCase();
      return !desiredPrefixes.some((prefix) => cbCode.startsWith(prefix));
    });
    for (const cb of toUncheck) {
      await clickACheckbox(cb, 40);
    }
    log(`Cleared ${toUncheck.length} unwanted selection(s) for "${serviceTypeId}" (scoped).`);
    await sleep(150);

    // ── Step 4: select validated countries + cascade fallback ──
    // After clicking a parent checkbox (e.g. IT0), verify that the whole group
    // (all IT* checkboxes) got selected. If not (cascade failed for programmatic
    // clicks), select each unchecked member of the group individually.
    let selected = 0;
    for (const { code } of resolved) {
      const value = `${serviceTypeId}~${code}`;
      const freshCb = await findCheckboxInModal(modal, value, code);
      if (!freshCb) {
        warn(`editRegionCountries: "${code}" not found after clearing — skipping.`);
        continue;
      }

      if (!freshCb.checked) {
        await clickACheckbox(freshCb, 100);
        await sleep(100);
      } else {
        log(`  · "${code}" already checked — skipping click.`);
      }

      // Verify full group coverage (handles parent-cascade failures).
      // Count all non-disabled checkboxes in this code's prefix group.
      const groupPrefix = `${serviceTypeId}~${code.slice(0, 2)}`;
      const groupAll   = [...modal.querySelectorAll(`input[type='checkbox'][id^='${groupPrefix}']:not(:disabled)`)];
      const groupDone  = groupAll.filter((cb) => cb.checked).length;

      if (groupDone < groupAll.length) {
        log(`  "${code}" cascade incomplete (${groupDone}/${groupAll.length} checked) — selecting remaining individually.`);
        for (const cb of groupAll) {
          if (!cb.checked) await clickACheckbox(cb, 30);
        }
        log(`  Individually selected ${groupAll.length - groupDone} remaining checkbox(es) for "${code}" group.`);
      } else {
        log(`  ✓ "${code}" group fully selected (${groupDone}/${groupAll.length}).`);
      }

      selected++;
    }

    log(`editRegionCountries: ${selected}/${countries.length} countries selected — confirming modal.`);

    await confirmModal(modal);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // openCountriesModalOnRow
  // Clicks the "Edit region" / countries edit link/button on an existing row.
  // ─────────────────────────────────────────────────────────────────────────

  async function openCountriesModalOnRow(row) {
    log("openCountriesModalOnRow: clicking edit...");

    const editBtn = (
      row.querySelector("a[id*='editRegion']")                    ||
      row.querySelector("button[id*='editRegion']")               ||
      row.querySelector("a[name*='editRegion']")                  ||
      row.querySelector("button[aria-label*='edit' i]")           ||
      row.querySelector("a[aria-label*='edit' i]")                ||
      row.querySelector("[data-action*='edit-region']")           ||
      row.querySelector("span[data-action*='edit']")              ||
      [...row.querySelectorAll("a, button")]
        .find((el) => /edit\s*(region|countries)?/i.test(el.textContent || el.getAttribute("aria-label") || ""))
    );

    assertFound(editBtn, "edit-region button on row");
    await clickAndWait(editBtn, 600);

    const modal = await waitForModal(8_000);

    // Validate: modal must contain country checkboxes — confirms it's the right modal
    await waitForCondition(
      () => modal.querySelector("input[type='checkbox']"),
      { timeout: 5_000, label: "country checkboxes inside modal" }
    );

    log(`Countries modal validated — found ${modal.querySelectorAll("input[type='checkbox']").length} checkbox(es).`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // readCheckedRegionCodes
  // Opens each existing row's "Edit region" modal in read-only fashion:
  // reads the checked country checkbox codes scoped to `serviceTypeId`, then
  // cancels the modal WITHOUT saving. Returns a deduplicated array of codes.
  // Used to capture what EU_STANDARD.DOMESTIC actually saved, so the same
  // codes can be reused for EU_EXPEDITED / EU_PREMIUM / EU_NEXT_DAY.
  // ─────────────────────────────────────────────────────────────────────────

  async function readCheckedRegionCodes(sectionRoot, serviceTypeId) {
    log(`readCheckedRegionCodes → "${serviceTypeId}"`);
    const rows = getRegionRows(sectionRoot);
    if (rows.length === 0) {
      log(`readCheckedRegionCodes: no rows in "${serviceTypeId}" — returning [].`);
      return [];
    }

    const allCodes = new Set();

    for (let i = 0; i < rows.length; i++) {
      log(`readCheckedRegionCodes: opening row ${i + 1}/${rows.length}...`);
      await openCountriesModalOnRow(rows[i]);
      await sleep(200);

      const modal = getVisibleModal();
      if (!modal) {
        warn(`readCheckedRegionCodes: no visible modal after opening row ${i + 1} — skipping.`);
        continue;
      }

      // Read checked checkboxes scoped to this serviceTypeId
      const checked = [...modal.querySelectorAll(
        `input[type='checkbox'][id^='${serviceTypeId}~']:checked:not(:disabled)`
      )];
      for (const cb of checked) {
        const code = cb.id.split("~")[1];
        if (code) allCodes.add(code.toUpperCase());
      }
      log(`readCheckedRegionCodes: row ${i + 1} — ${checked.length} checked checkbox(es).`);

      // Cancel modal without saving
      const cancelBtn = (
        [...modal.querySelectorAll("button")].find((b) => /cancel/i.test(b.textContent.trim())) ||
        modal.querySelector("button[data-action='a-popover-close']")
      );
      if (cancelBtn) {
        cancelBtn.click();
        await sleep(400);
      } else {
        warn(`readCheckedRegionCodes: cancel button not found for row ${i + 1} — modal may remain open.`);
      }
    }

    const codes = [...allCodes];
    log(`readCheckedRegionCodes: "${serviceTypeId}" — ${codes.length} unique code(s): [${codes.join(", ")}]`);
    return codes;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // clickAddRegion
  // Clicks the "Add new region" button inside a section and waits for the
  // resulting UI change (either a new row or an immediate modal).
  // Returns { type: "row" | "modal", element }
  // ─────────────────────────────────────────────────────────────────────────

  async function clickAddRegion(sectionRoot, serviceTypeId) {
    log(`clickAddRegion → "${serviceTypeId}"`);

    const addBtn = (
      // Primary: Amazon's known button ID pattern for each service type
      document.getElementById(`${serviceTypeId}_addRuleButton-announce`)          ||
      document.getElementById(`${serviceTypeId}_addRuleButton`)                   ||
      // Scoped fallbacks inside sectionRoot
      sectionRoot.querySelector("button[id*='addRuleButton']")                    ||
      sectionRoot.querySelector("button[id*='addRegion']")                        ||
      sectionRoot.querySelector("a[id*='addRegion']")                             ||
      sectionRoot.querySelector("[data-action*='add-region']")                    ||
      sectionRoot.querySelector("[data-action*='addRegion']")                     ||
      // Global text fallback
      [...document.querySelectorAll("button, a, input[type='button'], input[type='submit']")]
        .find((el) => /add\s*(new\s)?region/i.test(el.textContent || el.value || el.getAttribute("aria-label") || ""))
    );

    assertFound(addBtn, `"Add new region" button in section "${serviceTypeId}"`);

    const rowsBefore = getRegionRows(sectionRoot).length;
    await clickAndWait(addBtn, 800);

    // Determine what appeared: a modal (with checkboxes) or a new row?
    // IMPORTANT: require the modal to contain checkboxes scoped to THIS serviceTypeId
    // (id or value starts with "serviceTypeId~") to avoid picking up a stale domestic modal.
    const result = await waitForCondition(
      () => {
        const modal = getVisibleModal();
        if (modal) {
          // Check for checkboxes scoped to this service type (id or value contains serviceTypeId~)
          const scopedCb = (
            modal.querySelector(`input[type='checkbox'][id^='${serviceTypeId}~']`)    ||
            modal.querySelector(`input[type='checkbox'][value^='${serviceTypeId}~']`)
          );
          if (scopedCb) return { type: "modal", element: modal };
        }

        const rows = getRegionRows(sectionRoot);
        if (rows.length > rowsBefore) return { type: "row", element: rows[rows.length - 1] };

        return null;
      },
      { timeout: 8_000, label: `new region row or country modal after clicking Add for "${serviceTypeId}"` }
    );

    log(`clickAddRegion: result type="${result.type}" for "${serviceTypeId}"`);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // clearSectionRows
  // Deletes ALL existing region rows in a section by clicking each Delete link
  // and confirming the "Remove Region" modal. Used to start fresh before adding
  // new rows (e.g. international sections that arrive pre-populated).
  // ─────────────────────────────────────────────────────────────────────────

  async function clearSectionRows(sectionRoot, serviceTypeId) {
    const initial = getRegionRows(sectionRoot);
    if (initial.length === 0) {
      log(`clearSectionRows: no rows to delete in "${serviceTypeId}" — already empty.`);
      return;
    }
    log(`clearSectionRows: deleting ${initial.length} existing row(s) in "${serviceTypeId}"...`);

    const safetyLimit = initial.length + 5;
    for (let attempt = 0; attempt < safetyLimit; attempt++) {
      const freshRoot = getSectionRoot(serviceTypeId) || sectionRoot;
      const rows = getRegionRows(freshRoot);
      if (rows.length === 0) break;

      const row = rows[0];
      const deleteBtn = (
        row.querySelector("a[id*='delete' i], button[id*='delete' i]") ||
        [...row.querySelectorAll("a, button, span[role='button']")]
          .find((b) => /^delete$/i.test(b.textContent.trim()))
      );

      if (!deleteBtn) {
        warn(`clearSectionRows: no Delete button found in row ${attempt} — aborting clear.`);
        break;
      }

      const countBefore = rows.length;
      log(`clearSectionRows: clicking Delete on row ${attempt + 1}/${countBefore}...`);
      await clickAndWait(deleteBtn, 600);

      // "Remove Region" confirmation modal appears on first delete.
      // After checking "Don't show this message again", subsequent deletes skip it.
      // Use a short timeout for attempts > 0 since the modal likely won't appear.
      const modalTimeout = attempt === 0 ? 4_000 : 1_500;
      const modal = await waitForCondition(
        () => getVisibleModal(),
        { timeout: modalTimeout, label: "Remove Region modal" }
      ).catch(() => null);

      if (modal) {
        log(`clearSectionRows: confirming Remove Region modal...`);
        // On the first delete: check "Don't show this message again" so subsequent
        // deletes skip the confirmation modal entirely.
        if (attempt === 0) {
          const dontShowCb = modal.querySelector("input[type='checkbox'][name='show_delete_popup']");
          if (dontShowCb && !dontShowCb.checked) {
            log(`clearSectionRows: checking "Don't show this message again"...`);
            dontShowCb.click();
            await sleep(150);
          }
        }
        await confirmModal(modal);
      }

      // Wait for row count to drop
      await waitForCondition(
        () => {
          const r = getSectionRoot(serviceTypeId) || sectionRoot;
          return getRegionRows(r).length < countBefore;
        },
        { timeout: 5_000, label: "row removed" }
      ).catch(() => warn(`clearSectionRows: row count did not decrease after delete — continuing.`));

      await sleep(200);
    }

    const finalRoot = getSectionRoot(serviceTypeId) || sectionRoot;
    const finalCount = getRegionRows(finalRoot).length;
    log(`clearSectionRows: "${serviceTypeId}" cleared — ${finalCount} row(s) remain.`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setAddressTypes
  // Checks all address_type checkboxes (Street, PO Box, etc.) in a row.
  // Amazon requires at least "Street" to be checked; we check all available.
  // Uses label click (Amazon a-checkbox pattern).
  // ─────────────────────────────────────────────────────────────────────────

  async function setAddressTypes(row) {
    log("STEP: setAddressTypes");
    // Street label text is in a sibling <span class="checkbox_label"> outside
    // the a-checkbox div, so we can't find it by label text.
    // Use name="address_type" value="STREET" to target directly.
    const streetInput = row.querySelector("input[name='address_type'][value='STREET']");
    if (!streetInput) {
      log("setAddressTypes: 'Street' input not found — skipping.");
      return;
    }
    if (streetInput.disabled) {
      log("setAddressTypes: 'Street' is disabled (Amazon-controlled) — skipping.");
      return;
    }
    if (streetInput.checked) {
      log("setAddressTypes: 'Street' already checked — skipping.");
      return;
    }
    const lbl = streetInput.closest("label");
    (lbl || streetInput).click();
    await sleep(60);
    log("setAddressTypes: 'Street' checked ✓");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // configureRegion
  // High-level: ensures region row at `index` exists, sets countries,
  // transit time, and pricing.
  // ─────────────────────────────────────────────────────────────────────────

  async function configureRegion(sectionRoot, serviceTypeId, index, regionConfig) {
    log(`STEP: configureRegion #${index} → "${serviceTypeId}"`);
    log(`configureRegion #${index} → "${serviceTypeId}"`, regionConfig);

    const { countries, transitTime, pricing } = regionConfig;
    let row;

    // countries is optional — if omitted/null/empty, skip country editing entirely
    // and only update transit time + pricing on the existing row.
    const hasCountries = Array.isArray(countries) && countries.length > 0;

    const existingRows = getRegionRows(sectionRoot);

    log(`configureRegion #${index}: found ${existingRows.length} existing row(s) in section.`);

    if (existingRows[index]) {
      // ── Existing row ──
      log(`configureRegion #${index}: EDITING existing row (not adding new).`);
      row = existingRows[index];

      if (hasCountries) {
        log(`Region row #${index} exists — editing countries.`);
        await openCountriesModalOnRow(row);
        const modal = getVisibleModal();
        assertFound(modal, "country modal after clicking edit");
        await editRegionCountries(modal, serviceTypeId, countries);

        // Re-fetch row reference (DOM may have been rebuilt after modal close)
        await sleep(300);
        row = getRegionRows(sectionRoot)[index];
        assertFound(row, `region row #${index} after editing countries`);
      } else {
        log(`Region row #${index} exists — no countries specified, skipping country edit.`);
      }

    } else {
      // ── New row: click Add Region ──
      log(`configureRegion #${index}: ADDING new row (no existing row at this index).`);
      const { type, element } = await clickAddRegion(sectionRoot, serviceTypeId);

      if (type === "modal") {
        if (hasCountries) {
          await editRegionCountries(element, serviceTypeId, countries);
        } else {
          // No countries specified — confirm modal with whatever defaults Amazon pre-selects
          log(`Region row #${index}: no countries specified — confirming modal with default selection.`);
          await confirmModal(element);
        }
        await sleep(300);
        row = getRegionRows(sectionRoot)[index];
        assertFound(row, `region row #${index} after adding via modal`);

      } else {
        // New row appeared directly
        row = element;
        if (hasCountries) {
          await openCountriesModalOnRow(row);
          const modal = getVisibleModal();
          assertFound(modal, "country modal after clicking edit on new row");
          await editRegionCountries(modal, serviceTypeId, countries);
          await sleep(300);
          row = getRegionRows(sectionRoot)[index];
          assertFound(row, `region row #${index} after setting countries on new row`);
        } else {
          log(`Region row #${index}: no countries specified — leaving default selection.`);
        }
      }
    }

    // ── Re-fetch fresh DOM references before interacting with inputs ──
    // Amazon may re-render rows after modal operations. Never reuse a reference
    // captured before a modal was opened — always resolve from live DOM.
    log(`configureRegion #${index}: resolving fresh row reference from live DOM...`);

    const freshSectionRoot = getSectionRoot(serviceTypeId);
    if (!freshSectionRoot) {
      throw new Error(`${LOG} configureRegion #${index}: sectionRoot not found after re-render for "${serviceTypeId}"`);
    }

    const freshRows = getRegionRows(freshSectionRoot);
    log(`configureRegion #${index}: found ${freshRows.length} row(s) after re-render.`);

    if (freshRows.length === 0) {
      log(`configureRegion #${index}: sectionRoot HTML (debug): ${freshSectionRoot.outerHTML.slice(0, 500)}`);
      throw new Error(`${LOG} configureRegion #${index}: no rows found in section "${serviceTypeId}" after re-render`);
    }

    const freshRow = freshRows[index];
    if (!freshRow) {
      log(`configureRegion #${index}: sectionRoot HTML (debug): ${freshSectionRoot.outerHTML.slice(0, 500)}`);
      throw new Error(`${LOG} configureRegion #${index}: row #${index} not found (${freshRows.length} row(s) available) in "${serviceTypeId}"`);
    }

    log(`configureRegion #${index}: fresh row resolved — proceeding to transit time and pricing.`);

    // ── Transit time ──
    if (transitTime) {
      await setTransitTime(freshRow, transitTime);
      // Backbone may re-render the row after shippingTime changes — wait and re-resolve.
      await sleep(400);
    }

    // ── Re-resolve row before pricing (Backbone may have rebuilt the row after transit change) ──
    const sectionRootForPricing = getSectionRoot(serviceTypeId);
    const rowsForPricing = sectionRootForPricing ? getRegionRows(sectionRootForPricing) : [];
    const rowForPricing = rowsForPricing[index] || freshRow; // fall back to freshRow if re-query fails
    log(`configureRegion #${index}: row for pricing resolved (connected=${rowForPricing.isConnected}).`);

    // ── Pricing ──
    // NOTE: pricing inputs only exist inside a rendered region row after
    // rateModel=shipment_based is active. waitForElement is used inside setPricing.
    await setPricing(rowForPricing, pricing);

    // ── Address Types ──
    // Must be checked after pricing — Amazon adds address_type checkboxes to
    // the row only after the row is fully rendered. "Street" must be checked
    // or Amazon shows "Delivery to all regions is required" validation error.
    await setAddressTypes(rowForPricing);

    log(`Region #${index} for "${serviceTypeId}" configured ✓`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // configureShippingSection
  // Enables the service type, resolves its section root, then configures
  // each region defined in `sectionConfig.regions`.
  // ─────────────────────────────────────────────────────────────────────────

  async function configureShippingSection(serviceTypeId, sectionConfig) {
    log(`STEP: configureShippingSection → "${serviceTypeId}"`);
    log(`─── configureShippingSection → "${serviceTypeId}" ───`);

    if (!sectionConfig.enabled) {
      log(`"${serviceTypeId}" disabled in config — skipping.`);
      return null;
    }

    // readOnly mode: do NOT modify the section — just read back current region codes.
    // Used when EU_STANDARD.DOMESTIC is already configured and other sections should
    // inherit its region codes rather than specifying their own.
    if (sectionConfig.readOnly === true) {
      log(`"${serviceTypeId}" readOnly=true — reading current codes without modifying.`);
      const root = getSectionRoot(serviceTypeId);
      if (!root || root === document.body || root === document.documentElement) {
        warn(`readOnly: section root not found for "${serviceTypeId}" — returning [].`);
        return [];
      }
      const codes = await readCheckedRegionCodes(root, serviceTypeId);
      log(`"${serviceTypeId}" readOnly complete — ${codes.length} code(s) returned.`);
      return codes;
    }

    // Step 1: enable
    await enableServiceType(serviceTypeId);

    // Step 2: wait for section root to appear in the DOM.
    // For always-enabled sections (EU_STANDARD.DOMESTIC) this is instant.
    // For newly-enabled sections (EU_EXPEDITED.DOMESTIC) Amazon may take
    // 1–3 seconds to render the section UI after the checkbox is clicked.
    log(`configureShippingSection: waiting for section root to appear for "${serviceTypeId}"...`);
    const sectionRoot = await waitForCondition(
      () => {
        const r = getSectionRoot(serviceTypeId);
        // Reject overly broad roots (body/html) — keep waiting
        if (!r || r === document.body || r === document.documentElement) return null;
        return r;
      },
      { timeout: 10_000, label: `section root for "${serviceTypeId}"` }
    );

    log(`Section root resolved for "${serviceTypeId}" (tag="${sectionRoot.tagName}", id="${sectionRoot.id}").`);

    // Step 3: clear existing rows if requested
    if (sectionConfig.clearExisting === true) {
      log(`configureShippingSection: clearExisting=true — deleting all existing rows in "${serviceTypeId}"...`);
      await clearSectionRows(sectionRoot, serviceTypeId);
      await sleep(300);
    }

    // Step 4: configure regions
    const regions = sectionConfig.regions ?? [];
    for (let i = 0; i < regions.length; i++) {
      log(`── Region ${i + 1}/${regions.length} (index=${i}) ──`);

      // Re-resolve sectionRoot before each region — the previous region's modal
      // operations may have caused Amazon to rebuild the section DOM node.
      const currentRoot = getSectionRoot(serviceTypeId) || sectionRoot;
      if (currentRoot !== sectionRoot) {
        log(`configureShippingSection: sectionRoot re-resolved before region ${i + 1} (DOM rebuilt after prior modal).`);
      }

      await configureRegion(currentRoot, serviceTypeId, i, regions[i]);
      await sleep(300);
    }

    // Final diagnostic: log total rows in DOM.
    // Note: Amazon pre-populates domestic sections with multiple rows, so total rows
    // will often exceed the number of regions in the config — this is expected.
    const finalRoot = getSectionRoot(serviceTypeId) || sectionRoot;
    const finalRows = getRegionRows(finalRoot);
    log(`configureShippingSection: "${serviceTypeId}" complete — ${finalRows.length} total row(s) in DOM, configured ${regions.length} region(s).`);

    // If the section ended up with 0 rows, uncheck its checkbox so Amazon doesn't
    // show a "regions missing transit times" warning.
    if (finalRows.length === 0) {
      log(`configureShippingSection: 0 rows in "${serviceTypeId}" — unchecking service type checkbox.`);
      await disableServiceType(serviceTypeId);
    }

    log(`"${serviceTypeId}" fully configured ✓`);

    // publishCodes: read back the actual saved region codes so subsequent sections
    // can inherit them (via inheritRegions: true) instead of specifying their own.
    if (sectionConfig.publishCodes === true) {
      log(`"${serviceTypeId}": publishCodes=true — reading back configured region codes.`);
      const currentRoot = getSectionRoot(serviceTypeId) || finalRoot;
      const codes = await readCheckedRegionCodes(currentRoot, serviceTypeId);
      log(`"${serviceTypeId}" published ${codes.length} code(s): [${codes.join(", ")}]`);
      return codes;
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // main
  // Entry point. Call with a parsed config object.
  // ─────────────────────────────────────────────────────────────────────────

  async function main(config) {
    log("════════════════════════════════════════");
    log("Shipping Template Automation — START");
    log("Config:", JSON.stringify(config, null, 2));
    log("════════════════════════════════════════");

    // ── Validate ──
    if (!config || typeof config !== "object") {
      throw new Error(`${LOG} main: config must be a non-null object.`);
    }
    if (config.rateModel !== "shipment_based") {
      throw new Error(`${LOG} main: unsupported rateModel "${config.rateModel}". Only "shipment_based" supported.`);
    }

    // ── 1. Template name ──
    await setTemplateName(config.templateName);
    await sleep(200);

    // ── 2. Rate model ──
    await setRateModel(config.rateModel);
    await sleep(300);

    // ── 3. SSA ──
    if (typeof config.ssaEnabled === "boolean") {
      await toggleSSA(config.ssaEnabled);
      await sleep(200);
    }

    // ── 4. Domestic sections ──
    // EU_STANDARD.DOMESTIC is always processed first (it appears first in the config object).
    // If it has `publishCodes: true`, its saved region codes are stored and injected into
    // subsequent sections that have `inheritRegions: true` with empty `countries`.
    if (config.domesticShipping && typeof config.domesticShipping === "object") {
      let inheritedCodes = null;
      // Ensure STANDARD is always processed first (JSON serialisation sorts keys
      // alphabetically, so EXPEDITED/NEXT_DAY/PREMIUM would come before STANDARD
      // otherwise and inheritedCodes would be null when they need it).
      const domesticEntries = Object.entries(config.domesticShipping).sort(([a], [b]) => {
        const aStd = a.includes("STANDARD") ? 0 : 1;
        const bStd = b.includes("STANDARD") ? 0 : 1;
        return aStd - bStd;
      });
      for (const [serviceTypeId, sectionConfig] of domesticEntries) {
        // Inject inherited codes into regions that have empty or missing countries
        if (sectionConfig.inheritRegions === true && sectionConfig.regions) {
          if (inheritedCodes && inheritedCodes.length > 0) {
            log(`main: injecting ${inheritedCodes.length} inherited code(s) into "${serviceTypeId}" regions.`);
            for (const region of sectionConfig.regions) {
              if (!region.countries || region.countries.length === 0) {
                region.countries = inheritedCodes;
              }
            }
          } else {
            warn(`main: "${serviceTypeId}" has inheritRegions=true but no inherited codes available yet — skipping section.`);
            await sleep(400);
            continue;
          }
        }

        const result = await configureShippingSection(serviceTypeId, sectionConfig);

        // Store returned codes for subsequent sections to inherit
        if (Array.isArray(result) && result.length > 0) {
          inheritedCodes = result;
          log(`main: stored ${inheritedCodes.length} code(s) from "${serviceTypeId}" for inheritance.`);
        }

        await sleep(400);
      }
    }

    // ── 5. International sections ──
    if (config.internationalShipping && typeof config.internationalShipping === "object") {
      for (const [serviceTypeId, sectionConfig] of Object.entries(config.internationalShipping)) {
        await configureShippingSection(serviceTypeId, sectionConfig);
        await sleep(400);
      }
    }

    // ── Final validation scan ──
    // Check for Amazon validation error banners on the page.
    await sleep(500);
    const errorEls = [
      ...document.querySelectorAll(".sbr_requirements_message_view_regions_not_covered"),
      ...document.querySelectorAll("[class*='regionError']"),
      // Only catch .addRegionsBox when Amazon explicitly sets display:block via inline style.
      // The :not([style*='display: none']) variant is too broad — it matches the always-visible
      // "Add Regions" section container whose text looks like an error but isn't.
      ...document.querySelectorAll(".addRegionsBox[style*='display: block']"),
    ];
    const errorItems = [...new Map(
      errorEls
        .map((el) => {
          const text = el.textContent.trim().replace(/\s+/g, " ").slice(0, 200);
          return text ? [text, `[${el.className.split(" ").slice(0, 3).join(".")}] ${text}`] : null;
        })
        .filter(Boolean)
    ).values()];
    if (errorItems.length > 0) {
      warn(`VALIDATION ERRORS DETECTED (${errorItems.length}):`);
      errorItems.forEach((t, i) => warn(`  [${i + 1}] ${t}`));
    } else {
      log("Final validation scan: no error banners found ✓");
    }

    log("════════════════════════════════════════");
    log("Shipping Template Automation — COMPLETE ✓");
    log("════════════════════════════════════════");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT
  // Expose as a global so the background script / popup can invoke it via
  // chrome.scripting.executeScript({ func: () => window.__runShippingTemplateAutomation(config) })
  // ─────────────────────────────────────────────────────────────────────────

  window.__runShippingTemplateAutomation = async (config) => {
    try {
      await main(config);
      return { success: true, log: _logBuffer.join("\n"), status: "SUCCESS" };
    } catch (err) {
      _bufferLine("ERROR", err?.message || String(err), []);
      return { success: false, error: err?.message || String(err), log: _logBuffer.join("\n"), status: "ERROR" };
    }
  };

  log("Shipping Template Automator loaded. Call window.__runShippingTemplateAutomation(config) to run.");
})();
