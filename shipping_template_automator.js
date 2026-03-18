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

  function _downloadLog(status) {
    try {
      const now    = new Date();
      const pad    = (n) => String(n).padStart(2, "0");
      const stamp  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`
                   + `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fname  = `ShippingTemplate_${status}_${stamp}.log`;
      const blob   = new Blob([_logBuffer.join("\n")], { type: "text/plain" });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement("a");
      a.href       = url;
      a.download   = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`${LOG} Log saved → ${fname}`);
    } catch (e) {
      console.warn(`${LOG} Log download failed:`, e);
    }
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
  // waitForElementToDisappear
  // Resolves when element matching selector is removed or hidden.
  // ─────────────────────────────────────────────────────────────────────────

  function waitForElementToDisappear(selector, { root = document, timeout = T } = {}) {
    const isGone = () => {
      const el = root.querySelector(selector);
      return !el || getComputedStyle(el).display === "none" || el.hasAttribute("hidden");
    };

    return new Promise((resolve, reject) => {
      if (isGone()) return resolve();

      const tid = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`${LOG} waitForElementToDisappear timeout: "${selector}"`));
      }, timeout);

      const obs = new MutationObserver(() => {
        if (isGone()) {
          clearTimeout(tid);
          obs.disconnect();
          resolve();
        }
      });

      const target = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
      obs.observe(target, { childList: true, subtree: true, attributes: true });
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

    // Step 1 — wait for primary stable ID to appear in DOM.
    // The button is <button id="submitButtonInPopup-announce"> confirmed on live page.
    // waitForElement is used (not querySelector) because the button may render
    // a few ms after the modal itself becomes visible.
    let btn = await waitForElement(
      "#submitButtonInPopup-announce",
      { root: modal, timeout: 5_000 }
    ).catch(() => null);

    // Step 2 — sequential fallbacks (synchronous, modal is already open)
    if (!btn) btn = modal.querySelector("#submitButtonInPopup button");
    if (!btn) btn = modal.querySelector(".a-button-primary button");

    assertFound(btn, "OK button in modal (#submitButtonInPopup-announce not found)");

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
      const root = addRuleBtn.closest(
        "section, article, [class*='service-type'], [class*='serviceType'], " +
        "[class*='shipping-section'], [class*='rate-section'], " +
        "tbody, table, [class*='a-section']"
      ) || addRuleBtn.parentElement?.parentElement?.parentElement || addRuleBtn.parentElement;
      log(`getSectionRoot: found via addRuleButton for "${serviceTypeId}" (tag="${root?.tagName}", id="${root?.id}")`);
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

      const option = (
        [...sel.options].find((o) => o.value === targetValue) ||
        [...sel.options].find((o) => o.value === transitTime) ||
        [...sel.options].find((o) => o.text.replace(/\s/g, "").includes(transitTime.replace(/\s/g, "")))
      );

      if (!option) {
        throw new Error(
          `${LOG} setTransitTime: option "${transitTime}" not found. ` +
          `Available: [${[...sel.options].map((o) => `${o.value}="${o.text}"`).join(", ")}]`
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

  async function expandCollapsedGroups(root) {
    // Collect all collapsed toggles. Filter to only interactive-looking elements
    // so we don't accidentally click form controls (checkboxes, selects, etc.).
    const isExpandToggle = (el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || "";
      return (
        tag === "button" || tag === "a" ||
        role === "button" || role === "tab" ||
        (tag === "span" && role !== "") ||
        tag === "div" && (el.getAttribute("aria-controls") || el.getAttribute("aria-expanded"))
      );
    };

    const collapsed = [
      ...root.querySelectorAll("[aria-expanded='false']"),
      ...root.querySelectorAll(".a-expander-header:not(.a-expander-header-expanded)"),
      ...root.querySelectorAll(".a-accordion-row.a-accordion-row-collapsed"),
    ].filter(isExpandToggle);

    if (collapsed.length === 0) {
      log("expandCollapsedGroups: no collapsed groups found — tree already fully expanded.");
      return;
    }

    log(`expandCollapsedGroups: expanding ${collapsed.length} collapsed group(s)...`);

    for (const toggle of collapsed) {
      const label =
        toggle.getAttribute("aria-label") ||
        toggle.textContent.trim().slice(0, 40) ||
        toggle.id ||
        "(unlabeled)";
      log(`  expanding: "${label}"`);
      await clickAndWait(toggle, 180);
    }

    // Let all expansion animations settle before querying children
    await sleep(250);
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
      // 1. By value attribute (primary: "EU_STANDARD.DOMESTIC~IT1")
      const byValue = modal.querySelector(`input[type='checkbox'][value='${value}']`);
      if (byValue) return byValue;

      // 2. By id attribute (some Amazon implementations use id instead of value)
      const byId = modal.querySelector(`input[type='checkbox'][id='${value}']`);
      if (byId) return byId;

      // 3. By associated label text matching country code
      for (const lbl of modal.querySelectorAll("label")) {
        const text = lbl.textContent.trim();
        if (text === code || text.endsWith(` ${code}`) || text.startsWith(`${code} `)) {
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

    // ── Pass 2: expand remaining collapsed groups, then retry ──
    log(`findCheckboxInModal: "${code}" not found — expanding collapsed groups and retrying...`);
    await expandCollapsedGroups(modal);

    const secondTry = lookup();
    if (secondTry) {
      log(`findCheckboxInModal: "${code}" found after expansion.`);
      return secondTry;
    }

    // Not found even after expansion
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

    // ── Step 1: expand the full tree upfront ──
    log("editRegionCountries: expanding modal tree...");
    await expandCollapsedGroups(modal);

    // ── Step 2: deselect all currently checked non-disabled checkboxes ──
    const checked = [...modal.querySelectorAll("input[type='checkbox']:checked:not(:disabled)")];
    for (const cb of checked) {
      await clickAndWait(cb, 40);
    }
    log(`Cleared ${checked.length} existing selection(s).`);
    await sleep(150);

    // ── Step 3: select desired countries ──
    let selected = 0;

    for (const code of countries) {
      const value = `${serviceTypeId}~${code}`;

      // findCheckboxInModal handles expand-and-retry if not found on first pass
      const cb = await findCheckboxInModal(modal, value, code);

      if (!cb) {
        warn(`editRegionCountries: "${code}" (value="${value}") not found even after expanding all groups — skipping.`);
        continue;
      }

      if (cb.disabled) {
        warn(`editRegionCountries: "${code}" checkbox is disabled — skipping.`);
        continue;
      }

      // Idempotency: only click if not already checked
      if (!cb.checked) {
        await clickAndWait(cb, 60);
        log(`  ✓ Selected: "${code}"`);
      } else {
        log(`  · Already checked: "${code}" — skipping click.`);
      }

      selected++;
    }

    if (selected === 0) {
      throw new Error(
        `${LOG} editRegionCountries: no countries could be selected ` +
        `(serviceType="${serviceTypeId}", requested=[${countries.join(", ")}])`
      );
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
    const result = await waitForCondition(
      () => {
        const modal = getVisibleModal();
        // Only treat as modal result if it actually has country checkboxes inside
        if (modal && modal.querySelector("input[type='checkbox']")) {
          return { type: "modal", element: modal };
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

    if (existingRows[index]) {
      // ── Existing row ──
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
      log(`Region row #${index} does not exist — adding.`);
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
      return;
    }

    // Step 1: enable
    await enableServiceType(serviceTypeId);
    await sleep(500); // allow any UI expansion to settle

    // Step 2: find section root
    const sectionRoot = getSectionRoot(serviceTypeId);
    assertFound(sectionRoot, `section root for "${serviceTypeId}"`);

    // Validate sectionRoot is reasonably scoped — not the entire body/html
    if (sectionRoot === document.body || sectionRoot === document.documentElement) {
      throw new Error(
        `${LOG} configureShippingSection: getSectionRoot returned an overly broad element ` +
        `for "${serviceTypeId}" — region row queries would not be section-scoped.`
      );
    }
    log(`Section root resolved for "${serviceTypeId}" (tag="${sectionRoot.tagName}", id="${sectionRoot.id}").`);

    // Step 3: configure regions
    const regions = sectionConfig.regions ?? [];
    for (let i = 0; i < regions.length; i++) {
      log(`── Region ${i + 1}/${regions.length} ──`);
      await configureRegion(sectionRoot, serviceTypeId, i, regions[i]);
      await sleep(300);
    }

    log(`"${serviceTypeId}" fully configured ✓`);
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
    if (config.domesticShipping && typeof config.domesticShipping === "object") {
      for (const [serviceTypeId, sectionConfig] of Object.entries(config.domesticShipping)) {
        await configureShippingSection(serviceTypeId, sectionConfig);
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
      _downloadLog("SUCCESS");
    } catch (err) {
      _bufferLine("ERROR", err?.message || String(err), []);
      _downloadLog("ERROR");
      throw err; // re-throw so popup still shows error state
    }
  };

  log("Shipping Template Automator loaded. Call window.__runShippingTemplateAutomation(config) to run.");
})();
