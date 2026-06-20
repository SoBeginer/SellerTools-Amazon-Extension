/**
 * shipping_price_changer.js
 * Injected by popup.js / background.js into Amazon Seller Central.
 *
 * Exposes:
 *   window.__listShippingTemplates()               — scrape template names from list page
 *   window.__selectTemplateInSidebar(name)         — click template in sidebar, wait for content
 *   window.__selectAndApplyForTemplate(name, cfg)  — fallback: click Edit button, apply prices
 *   window.__applyPriceChange(config)              — find price inputs, apply change, click Save
 *
 * config: { direction: "increase"|"decrease", changeType: "fixed"|"percent", amount: number }
 */

(function () {
  "use strict";

  if (window.__shippingPriceChangerLoaded) return;
  window.__shippingPriceChangerLoaded = true;

  const LOG = "[ShippingPriceChanger]";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── Sidebar helpers ───────────────────────────────────────────────────────

  function expandSeeMore() {
    const expander = document.querySelector(
      "#sbrui_element_shippingTemplateLinks [data-action='a-expander-toggle'], " +
      "#sbrui_element_shippingTemplateLinks .a-expander-header"
    );
    if (expander && expander.getAttribute("aria-expanded") === "false") {
      expander.click();
      return true;
    }
    return false;
  }

  function collectTemplateDivs() {
    return [...document.querySelectorAll(
      "#sbrui_element_shippingTemplateLinks div.shipping_template_link, " +
      "div.shipping_template_link"
    )].filter((div) => !div.querySelector("[data-action='a-expander-toggle']"));
  }

  function isSpaRendered() {
    return document.querySelector("div.shipping_template_link") !== null;
  }

  function extractTemplateName(div) {
    const anchor = div.querySelector("a");
    let name = (anchor?.textContent || div.textContent).trim();
    name = name.replace(/\s*(DEFAULT|Standard)\s*$/i, "").trim();
    return name.split(/\n/)[0].trim();
  }

  function scrapeTemplateLinks() {
    const templates = [];
    const seenNames = new Set();
    for (const div of collectTemplateDivs()) {
      const name = extractTemplateName(div);
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);
      templates.push({ name: name.slice(0, 80) });
    }
    return templates;
  }

  // ── List templates ────────────────────────────────────────────────────────

  window.__listShippingTemplates = async function (timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (isSpaRendered()) break;
      await sleep(400);
    }

    if (!isSpaRendered()) {
      console.warn(LOG, "Timed out — no shipping_template_link divs found.");
      return [];
    }

    if (expandSeeMore()) {
      await sleep(600);
    }

    const templates = scrapeTemplateLinks();
    console.log(LOG, `Found ${templates.length} template(s) in sidebar.`);
    return templates;
  };

  // ── Select template in sidebar (step 1 of 2) ──────────────────────────────
  // Clicks the named template in the sidebar and waits for the main content
  // area to update. Returns { selected: true } so background.js can then
  // inject a MAIN-world script to read the template's Backbone model ID.

  window.__selectTemplateInSidebar = async function (templateName) {
    const spaDeadline = Date.now() + 10_000;
    while (Date.now() < spaDeadline) {
      if (isSpaRendered()) break;
      await sleep(400);
    }
    if (!isSpaRendered()) {
      return { selected: false, error: "Template list sidebar not rendered." };
    }

    if (expandSeeMore()) {
      await sleep(600);
    }

    const divs = collectTemplateDivs();
    let targetDiv = null;
    for (const div of divs) {
      const name = extractTemplateName(div);
      if (name.slice(0, 80) === templateName || name === templateName) {
        targetDiv = div;
        break;
      }
    }

    if (!targetDiv) {
      console.warn(LOG, `Template "${templateName}" not found in sidebar.`);
      return { selected: false, error: `Template "${templateName}" not found in sidebar.` };
    }

    console.log(LOG, `Clicking "${templateName}" in sidebar…`);
    (targetDiv.querySelector("a") || targetDiv).click();

    // Wait for main content to update — look for a template_name element changing
    await sleep(2000);

    console.log(LOG, `Sidebar click done for "${templateName}".`);
    return { selected: true };
  };

  // ── Fallback: click Edit button and apply ─────────────────────────────────
  // Used when the Backbone model ID approach fails (e.g. for modern templates
  // where clicking Edit navigates correctly). Also used as a last resort.
  // If clicking Edit causes full-page navigation, background.js catches the
  // executeScript rejection and sets phase "applyChange".

  function findEditActionElement() {
    const sidebar = document.querySelector('#sbrui_element_shippingTemplateLinks');

    const byId = document.getElementById('edit');
    if (byId && !byId.classList.contains('a-disable-dropdown-option') && byId.offsetParent !== null) {
      return byId;
    }

    for (const el of document.querySelectorAll('a, button, li')) {
      const t = el.textContent.trim();
      if (t === 'Edit' || t === 'Bearbeiten') {
        if (!el.classList.contains('a-disable-dropdown-option') && el.offsetParent !== null) {
          if (!sidebar?.contains(el)) {
            console.log(LOG, `  edit-element: ${el.tagName} id="${el.id}" class="${el.className}"`);
            return el;
          }
        }
      }
    }

    for (const el of document.querySelectorAll('[id*="edit"], [data-action*="edit"]')) {
      const attrs = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      console.log(LOG, `  [debug-edit] ${el.tagName} ${JSON.stringify(attrs)} text="${el.textContent.trim().slice(0, 40)}"`);
    }

    return null;
  }

  window.__selectAndApplyForTemplate = async function (templateName, config) {
    const selectResult = await window.__selectTemplateInSidebar(templateName);
    if (!selectResult.selected) return selectResult;

    let editEl = findEditActionElement();

    if (!editEl) {
      const trigger = document.querySelector(
        '.a-button-dropdown .a-dropdown-trigger, button.a-dropdown-trigger, ' +
        '[data-action="a-dropdown-button"], .a-button-dropdown button'
      );
      if (trigger) {
        console.log(LOG, `Opening dropdown for "${templateName}"…`);
        trigger.click();
        await sleep(600);
        editEl = findEditActionElement();
      }
    }

    if (!editEl) {
      console.warn(LOG, `Edit action not found for "${templateName}".`);
      return { success: false, error: "Edit action not found." };
    }

    console.log(LOG, `Clicking Edit for "${templateName}"…`);
    editEl.click();

    // If Edit caused full-page navigation, context is destroyed here —
    // background.js catches the rejection and calls __applyPriceChange separately.
    await sleep(500);
    return await window.__applyPriceChange(config);
  };

  // ── Apply price change ────────────────────────────────────────────────────

  window.__applyPriceChange = async function (config) {
    const { direction, changeType, amount, priceType = "per_order", dryRun = false } = config;

    // per_order → pricePerOrder / price_per_order / shippingPrice
    // per_item  → unitPrice / unit_price
    const PER_ORDER_NAMES = new Set(["pricePerOrder", "price_per_order", "shippingPrice"]);
    const PER_ITEM_NAMES  = new Set(["unitPrice", "unit_price"]);
    const KNOWN_PRICE_NAMES = priceType === "per_item" ? PER_ITEM_NAMES : PER_ORDER_NAMES;

    const deadline = Date.now() + 15_000;
    let priceInputs = [];

    const PRICE_VALUE_RE = /^\d{1,6}([.,]\d{1,2})?$/;

    function isVisibleEnabled(el) {
      return !el.disabled && el.offsetParent !== null && el.value !== "" && el.value !== undefined;
    }

    console.log(LOG, `priceType=${priceType} — targeting names: [${[...KNOWN_PRICE_NAMES].join(", ")}]`);

    while (Date.now() < deadline) {
      // Primary: known name attributes filtered by priceType
      const byName = [...document.querySelectorAll("input")].filter(
        (el) => KNOWN_PRICE_NAMES.has(el.name) && isVisibleEnabled(el)
      );

      if (byName.length > 0) {
        priceInputs = byName;
        console.log(LOG, `Price inputs found by name (${[...new Set(byName.map((e) => e.name))].join(", ")})`);
        break;
      }

      // Fallback: visible text/number inputs whose value looks like a price (e.g. "14.90" or "0.00")
      const byValue = [...document.querySelectorAll("input[type='text'], input[type='number'], input:not([type])")].filter(
        (el) => isVisibleEnabled(el) && PRICE_VALUE_RE.test(el.value.trim().replace(",", "."))
      );

      if (byValue.length > 0) {
        priceInputs = byValue;
        console.log(LOG, `Price inputs found by value pattern (fallback): ${byValue.length} input(s), names: ${[...new Set(byValue.map((e) => e.name || "(no name)"))].join(", ")}`);
        break;
      }

      await sleep(300);
    }

    if (priceInputs.length === 0) {
      console.warn(LOG, "No price inputs found.");
      return { success: false, error: "No price inputs found on page.", changed: 0 };
    }

    console.log(LOG, `Found ${priceInputs.length} input(s). ${direction} by ${amount} (${changeType}). dryRun=${dryRun}`);

    let changed = 0;

    for (const input of priceInputs) {
      const raw = input.value.replace(",", ".");
      const current = parseFloat(raw);
      if (isNaN(current) || current < 0) continue;

      let newValue;
      if (changeType === "percent") {
        newValue =
          direction === "increase"
            ? current * (1 + amount / 100)
            : current * (1 - amount / 100);
      } else {
        newValue =
          direction === "increase" ? current + amount : current - amount;
      }

      newValue = Math.max(0, Math.round(newValue * 100) / 100);
      console.log(LOG, `  ${input.name}: ${current} → ${newValue}`);

      input.focus();
      setNativeValue(input, newValue.toFixed(2));
      input.blur();
      changed++;
      await sleep(80);
    }

    if (changed === 0) {
      return {
        success: false,
        error: "No price inputs could be changed (all values unreadable or negative).",
        changed: 0,
      };
    }

    const isSaveEl = (el) => {
      const t = (el.textContent || el.value || el.getAttribute("aria-label") || "")
        .trim().toLowerCase();
      return t === "save" || t.includes("save template") || t.includes("save changes") ||
             el.id === "submitButton-announce";
    };

    // Wait up to 5s for the Save button to appear and become enabled.
    // The form framework (Backbone/React) may need a moment after price input changes
    // before it enables the Save button.
    let saveBtn = null;
    const saveBtnDeadline = Date.now() + 5000;
    while (Date.now() < saveBtnDeadline) {
      saveBtn = [...document.querySelectorAll("button, input[type='submit'], input[type='button']")].find(
        (el) => (dryRun ? true : !el.disabled) && isSaveEl(el)
      );
      if (saveBtn) break;
      await sleep(300);
    }

    if (!saveBtn) {
      // Log all visible buttons to help diagnose
      const allBtns = [...document.querySelectorAll("button, input[type='submit'], input[type='button']")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => `"${(el.textContent || el.value || "").trim().slice(0, 40)}" disabled=${el.disabled}`);
      console.warn(LOG, "Save button not found. Visible buttons:", allBtns.join(" | "));
      return { success: false, error: "Save button not found.", changed };
    }

    if (dryRun) {
      console.log(LOG, `DRY RUN: would click save ("${saveBtn.textContent.trim()}")`);
      return { success: true, changed, dryRun: true };
    }

    console.log(LOG, `Clicking save: "${saveBtn.textContent.trim()}"`);
    saveBtn.click();

    await sleep(600);

    return { success: true, changed };
  };

  // ── Get direct edit URL for a named template ─────────────────────────────
  // Reads the template ID from the hidden input inside the sidebar div and
  // constructs the direct edit URL: /sbr/template?request={"templateId":"...","action":"edit"}

  window.__getTemplateEditUrl = async function (templateName) {
    const spaDeadline = Date.now() + 10_000;
    while (Date.now() < spaDeadline) {
      if (isSpaRendered()) break;
      await sleep(400);
    }
    if (!isSpaRendered()) {
      return { found: false, error: "Template list sidebar not rendered." };
    }

    if (expandSeeMore()) {
      await sleep(600);
    }

    const divs = collectTemplateDivs();
    for (const div of divs) {
      const name = extractTemplateName(div);
      if (name.slice(0, 80) === templateName || name === templateName) {
        const hiddenInput = div.querySelector("input[type='hidden'][id^='template_id_link']");
        const templateId = hiddenInput?.value;
        if (templateId) {
          const request = JSON.stringify({ templateId, action: "edit" });
          const editUrl = "/sbr/template?request=" + encodeURIComponent(request);
          console.log(LOG, `Edit URL for "${templateName}": ${editUrl}`);
          return { found: true, editUrl };
        }
        return { found: false, error: `Template "${templateName}" found but has no ID input.` };
      }
    }
    return { found: false, error: `Template "${templateName}" not found in sidebar.` };
  };

  // ── Delete a shipping template ────────────────────────────────────────────

  window.__deleteShippingTemplate = async function (templateName) {
    const spaDeadline = Date.now() + 10_000;
    while (Date.now() < spaDeadline) {
      if (isSpaRendered()) break;
      await sleep(400);
    }
    if (!isSpaRendered()) {
      return { success: false, error: "Template list sidebar not rendered." };
    }

    if (expandSeeMore()) await sleep(600);

    const divs = collectTemplateDivs();
    let targetDiv = null;
    for (const div of divs) {
      const name = extractTemplateName(div);
      if (name.slice(0, 80) === templateName || name === templateName) {
        targetDiv = div;
        break;
      }
    }
    if (!targetDiv) {
      return { success: false, error: `Template "${templateName}" not found in sidebar.` };
    }

    // Select the template in sidebar
    console.log(LOG, `Selecting "${templateName}" for deletion…`);
    (targetDiv.querySelector("a") || targetDiv).click();
    await sleep(1500);

    // Open the actions dropdown if available
    const trigger = document.querySelector(
      ".a-button-dropdown .a-dropdown-trigger, button.a-dropdown-trigger, " +
      "[data-action=\"a-dropdown-button\"], .a-button-dropdown button"
    );
    if (trigger) {
      console.log(LOG, "Opening dropdown…");
      trigger.click();
      await sleep(500);
    }

    // Find the Delete action (multi-language)
    const sidebar = document.querySelector("#sbrui_element_shippingTemplateLinks");
    const deleteEl = [...document.querySelectorAll("a, button, li")].find((el) => {
      const t = el.textContent.trim();
      return (
        /^(delete|löschen|eliminar|supprimer|elimina|verwijderen|usuń|ta bort|sil|odstranit)$/i.test(t) &&
        !el.classList.contains("a-disable-dropdown-option") &&
        el.offsetParent !== null &&
        !sidebar?.contains(el)
      );
    });

    if (!deleteEl) {
      console.warn(LOG, `Delete option not found for "${templateName}".`);
      return { success: false, error: "Delete option not found in dropdown." };
    }

    console.log(LOG, `Clicking Delete for "${templateName}"…`);
    deleteEl.click();
    await sleep(1200);

    // Confirm deletion dialog (multi-language)
    const confirmBtn = [...document.querySelectorAll("button, input[type='submit']")].find((el) => {
      const t = (el.textContent || el.value || el.getAttribute("aria-label") || "").trim();
      return (
        /^(delete|löschen|confirm|yes|bestätigen|ja|eliminar|sí|supprimer|oui|elimina|sì|verwijderen|usuń|tak|ta bort|sil|evet|odstranit|ano)$/i.test(t) &&
        el.offsetParent !== null
      );
    });

    if (!confirmBtn) {
      console.warn(LOG, `Confirmation button not found for "${templateName}".`);
      return { success: false, error: "Confirmation dialog not found." };
    }

    console.log(LOG, `Confirming deletion of "${templateName}"…`);
    confirmBtn.click();
    await sleep(1500);

    // Verify template is gone from sidebar
    if (expandSeeMore()) await sleep(400);
    const remaining = collectTemplateDivs();
    const stillExists = remaining.some((div) => {
      const n = extractTemplateName(div);
      return n.slice(0, 80) === templateName || n === templateName;
    });

    if (stillExists) {
      console.warn(LOG, `"${templateName}" still visible after deletion.`);
      return { success: false, error: "Template still visible after deletion attempt." };
    }

    console.log(LOG, `"${templateName}" deleted successfully.`);
    return { success: true };
  };

  console.log(LOG, "Loaded — __listShippingTemplates, __selectTemplateInSidebar, __getTemplateEditUrl, __selectAndApplyForTemplate, __applyPriceChange and __deleteShippingTemplate ready.");
})();
