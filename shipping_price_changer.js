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
      if (!name || name.length < 2 || seenNames.has(name)) continue;
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
    const { direction, changeType, amount } = config;

    const deadline = Date.now() + 15_000;
    let priceInputs = [];

    while (Date.now() < deadline) {
      priceInputs = [
        ...document.querySelectorAll(
          "input[name='pricePerOrder'], input[name='unitPrice'], " +
          "input[name='price_per_order'], input[name='unit_price']"
        ),
      ].filter(
        (el) =>
          !el.disabled &&
          el.offsetParent !== null &&
          el.value !== "" &&
          el.value !== undefined
      );
      if (priceInputs.length > 0) break;
      await sleep(300);
    }

    if (priceInputs.length === 0) {
      console.warn(LOG, "No price inputs found.");
      return { success: false, error: "No price inputs found on page.", changed: 0 };
    }

    console.log(LOG, `Found ${priceInputs.length} input(s). ${direction} by ${amount} (${changeType}).`);

    let changed = 0;

    for (const input of priceInputs) {
      const raw = input.value.replace(",", ".");
      const current = parseFloat(raw);
      if (!current || current <= 0) continue;

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
        error: "All price inputs had zero or unreadable values.",
        changed: 0,
      };
    }

    await sleep(400);

    const saveBtn = [...document.querySelectorAll("button, input[type='submit']")].find(
      (el) => {
        if (el.disabled) return false;
        const t = (
          el.textContent ||
          el.value ||
          el.getAttribute("aria-label") ||
          ""
        )
          .trim()
          .toLowerCase();
        return (
          t === "save" ||
          t === "uložit" ||
          t.includes("save template") ||
          t.includes("save changes") ||
          t.includes("uložit šablonu")
        );
      }
    );

    if (!saveBtn) {
      console.warn(LOG, "Save button not found.");
      return { success: false, error: "Save button not found.", changed };
    }

    console.log(LOG, `Clicking save: "${saveBtn.textContent.trim()}"`);
    saveBtn.click();

    await sleep(600);

    return { success: true, changed };
  };

  console.log(LOG, "Loaded — __listShippingTemplates, __selectTemplateInSidebar, __selectAndApplyForTemplate and __applyPriceChange ready.");
})();
