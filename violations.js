(async function() {
  "use strict";

  const DELAY_MS = 4000;
  const TARGET_REASONS = [
    "counterfeit without a test buy",
    "trademark on product",
    "product authenticity complaints",
  ];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function log(message) {
    console.log(`[ViolationScript] ${message}`);
  }

  function getTaskState() {
    return chrome.runtime.sendMessage({ type: "GET_VIOLATIONS_STATE" });
  }

  function finish() {
    chrome.runtime.sendMessage({ type: "SCRAPING_FINISHED" });
  }

  function escapeCsv(value) {
    return `"${String(value).replace(/"/g, "\"\"")}"`;
  }

  function getVisibleAsinSet() {
    const asins = [];
    [...document.querySelectorAll(".ahd-product-policy-table-row")]
      .filter(r => r.getBoundingClientRect().height > 0)
      .forEach(r => {
        for (const span of r.querySelectorAll("span")) {
          const t = span.textContent.trim();
          if (t.startsWith("ASIN:")) { asins.push(t); break; }
        }
      });
    return asins;
  }

  function processVisibleRows(violations) {
    const rows = [...document.querySelectorAll(".ahd-product-policy-table-row")]
      .filter(r => r.getBoundingClientRect().height > 0);

    rows.forEach((row) => {
      const cols = Array.from(row.children);
      const reasonRaw = cols[0]?.textContent?.trim() || "";
      const date = cols[1]?.textContent?.trim() || "";
      let asin = "";

      for (const span of row.querySelectorAll("span")) {
        const text = span.textContent.trim();
        if (text.startsWith("ASIN:")) { asin = text.replace("ASIN:", "").trim(); break; }
      }

      const reasonLower = reasonRaw.toLowerCase();
      const isTarget = TARGET_REASONS.some((targetReason) => {
        if (targetReason === "trademark on product") {
          return reasonLower.includes("trademark on product") && !reasonLower.includes("detail page");
        }
        return reasonLower.includes(targetReason);
      });

      if (isTarget && asin) {
        violations.push({ asin, date, reason: reasonRaw });
        log(`${asin} | ${date} | ${reasonRaw}`);
      }
    });

    return rows.length;
  }

  async function setPageSize100() {
    const dropdown = document.querySelector("#ahd-pp-pagination-page-size-dropdown");
    if (!dropdown) { log("Page size dropdown nenalezen."); return; }

    const currentValue = dropdown.getAttribute("value");
    log(`Page size dropdown nalezen, aktualni value="${currentValue}"`);
    if (currentValue === "100") { log("Page size uz je 100 — preskakuji."); return; }

    const beforeCount = [...document.querySelectorAll(".ahd-product-policy-table-row")]
      .filter(r => r.getBoundingClientRect().height > 0).length;
    log(`Pred zmenou: ${beforeCount} viditelnych radku`);

    if (beforeCount < 25) {
      log(`Mene nez 25 radku — vsechny zaznamy uz jsou viditelne, page size neni potreba.`);
      return;
    }

    // Krok 1: klikni na dropdown host element aby se otevřel
    log("Klikam na dropdown (otviram)...");
    dropdown.click();
    await sleep(600);

    // Krok 2: najdi option 100 v light DOM a klikni na ni
    const options = [...dropdown.querySelectorAll("kat-option")];
    log(`Nalezenych kat-option: ${options.length} — hodnoty: ${options.map(o => o.textContent.trim()).join(", ")}`);
    const option100 = options.find(o => o.textContent.trim().startsWith("100"));

    if (option100) {
      log("Klikam na option 100...");
      option100.click();
    } else {
      // Fallback: change event pokud option nenalezena
      log("Option 100 nenalezena — zkousim change event...");
      dropdown.dispatchEvent(new CustomEvent("change", {
        bubbles: true, composed: false, detail: { value: "100" }
      }));
    }

    // Čekej až počet viditelných řádků vzroste
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const afterCount = [...document.querySelectorAll(".ahd-product-policy-table-row")]
        .filter(r => r.getBoundingClientRect().height > 0).length;
      if (afterCount > beforeCount) {
        log(`✅ Page size zmenena — ${afterCount} radku nacteno za ${((i + 1) * 0.5).toFixed(1)}s`);
        return;
      }
    }
    log("⚠️ Timeout — page size se nezmenila, pokracuji s aktualnim poctem radku.");
  }

  async function collectPolicyRows() {
    log("Cekam na nacteni stranky policy (8 s)...");
    await sleep(8000);

    await setPageSize100();

    const allViolations = [];
    let page = 0;

    while (true) {
      page++;

      // Počkej na viditelné řádky
      let visibleCount = 0;
      for (let attempt = 0; attempt < 10; attempt++) {
        visibleCount = [...document.querySelectorAll(".ahd-product-policy-table-row")]
          .filter(r => r.getBoundingClientRect().height > 0).length;
        if (visibleCount > 0) break;
        log(`Cekam na viditelne radky... (${attempt + 1}/10)`);
        await sleep(2000);
      }

      if (visibleCount === 0) {
        log(`Zadne viditelne radky na strance ${page} — konec.`);
        break;
      }

      log(`Strana ${page}: ${visibleCount} viditelnych radku`);
      processVisibleRows(allViolations);

      // Počkej až kat-pagination se renderuje (po setPageSize100 může chvíli chybět)
      let katEl = null;
      let nextBtn = null;
      for (let k = 0; k < 10; k++) {
        katEl = document.querySelector("kat-pagination");
        nextBtn = katEl?.shadowRoot?.querySelector('[part="pagination-nav-right"]');
        if (nextBtn) break;
        log(`Cekam na kat-pagination... (${k + 1}/10)`);
        await sleep(500);
      }

      const isEnd = nextBtn?.classList.contains("end");
      const nextBtnClass = nextBtn?.className ?? "nenalezen";
      log(`kat-pagination next button: nalezen=${!!nextBtn}, class="${nextBtnClass}", isEnd=${isEnd}`);

      if (!nextBtn || isEnd) {
        log(`Posledni stranka — konec paginace.`);
        break;
      }

      // Zapamatuj si aktuální ASINy pro detekci překreslení
      const beforeAsins = getVisibleAsinSet().join(",");
      log(`Klikam na stranku ${page + 1}, pred-ASINy: ${getVisibleAsinSet().length} polozek`);
      nextBtn.click();

      // Čekej až DOM překreslí nové řádky (max 7.5s)
      let changed = false;
      for (let i = 0; i < 15; i++) {
        await sleep(500);
        const afterAsins = getVisibleAsinSet().join(",");
        if (afterAsins.length > 0 && afterAsins !== beforeAsins) {
          log(`Nova stranka nactena za ${((i + 1) * 0.5).toFixed(1)}s (${getVisibleAsinSet().length} ASINu)`);
          changed = true;
          break;
        }
      }

      if (!changed) {
        log(`⚠️ Timeout cekani na stranku ${page + 1} — before="${beforeAsins.slice(0, 60)}..."`);
        break;
      }
    }

    log(`Celkem cilovych violations: ${allViolations.length}`);
    chrome.runtime.sendMessage({ type: "VIOLATIONS_POLICY_COLLECTED", violations: allViolations });
  }

  async function collectOrderCount(asin) {
    log(`Vyhodnocuji objednavky pro ASIN: ${asin}...`);
    await sleep(DELAY_MS);

    let orderCount = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const bodyText = document.body?.innerText || "";
        const orderMatch = bodyText.match(/([\d,+]+)\s+orders(?:Last|\s+Last|\s*\n)/i);

        if (orderMatch) {
          orderCount = orderMatch[1].replace(/,/g, "");
          break;
        }

        const paginationElement = document.querySelector('[class*="pagination"]');
        const paginationText = paginationElement?.textContent || "";
        const paginationMatch = paginationText.match(/of\s+([\d,]+)\s+total\s+order/i);

        if (paginationMatch) {
          orderCount = paginationMatch[1].replace(/,/g, "");
          break;
        }

        if (bodyText.includes("No orders were found")) {
          orderCount = "0";
          break;
        }
      } catch (error) {
        log(`Chyba pri cteni objednavek (pokus ${attempt + 1}): ${error.message}`);
      }

      log(`Nacitam objednavky... (${attempt + 1}/10)`);
      await sleep(2000);
    }

    chrome.runtime.sendMessage({
      type: "VIOLATIONS_ORDER_COLLECTED",
      asin,
      orderCount: orderCount ?? "N/A"
    });
  }

  async function collectInventorySku(asin) {
    log(`Hledam SKU pro ASIN: ${asin}...`);
    await sleep(DELAY_MS + 1000);

    let sku = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const dataSkuElement = document.querySelector("[data-sku]");

        if (dataSkuElement) {
          const candidate = dataSkuElement.getAttribute("data-sku");

          if (candidate && candidate.trim().length > 0) {
            sku = candidate.trim();
            break;
          }
        }

        const skuLink = document.querySelector('a[href*="mSku="]');

        if (skuLink) {
          const href = skuLink.getAttribute("href") || "";
          const mskuMatch = href.match(/[?&]mSku=([^&]+)/i);

          if (mskuMatch) {
            sku = decodeURIComponent(mskuMatch[1]).trim();
            break;
          }
        }

        const skuTextLink = document.querySelector('a[href*="skucentral"]');

        if (skuTextLink) {
          const text = skuTextLink.textContent.trim();

          if (text.length > 0) {
            sku = text;
            break;
          }
        }

        const bodyText = document.body?.innerText || "";

        if (
          bodyText.includes("No products found") ||
          bodyText.includes("Keine Produkte gefunden") ||
          bodyText.includes("0 products")
        ) {
          sku = "NOT_FOUND";
          break;
        }
      } catch (error) {
        log(`Chyba pri cteni inventory (pokus ${attempt + 1}): ${error.message}`);
      }

      log(`Nacitam inventory... (${attempt + 1}/10)`);
      await sleep(2000);
    }

    chrome.runtime.sendMessage({
      type: "VIOLATIONS_INVENTORY_COLLECTED",
      asin,
      sku: sku ?? "N/A"
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function formatDate(raw) {
    if (!raw || raw === "N/A") return raw;
    const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const p2 = n => String(n).padStart(2, "0");
    // ISO: 2024-01-15
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    // "Jan 15, 2024" nebo "January 15, 2024"
    m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (m) { const mo = MONTHS[m[1].slice(0,3).toLowerCase()]; if (mo) return `${p2(m[2])}.${p2(mo)}.${m[3]}`; }
    // "15 Jan 2024"
    m = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) { const mo = MONTHS[m[2].slice(0,3).toLowerCase()]; if (mo) return `${p2(m[1])}.${p2(mo)}.${m[3]}`; }
    // "15/01/2024" nebo "15.01.2024"
    m = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
    if (m) return `${p2(m[1])}.${p2(m[2])}.${m[3]}`;
    return raw;
  }

  function buildSummaryLines(violations, uniqueAsins) {
    const counts = {};
    for (const v of violations) {
      const key = v.reason || "Neznámý typ";
      counts[key] = (counts[key] || 0) + 1;
    }
    const lines = ["", "=== Přehled typů violations ==="];
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sorted) {
      lines.push(`${reason}: ${count}`);
    }
    lines.push("─".repeat(40));
    lines.push(`Celkem: ${uniqueAsins.length} unikátních ASINů`);
    return lines;
  }

  function buildTxtLines(uniqueAsins, violations, asinSkuMap, asinOrderCount) {
    return uniqueAsins.map((asin) => {
      const violation = violations.find((entry) => entry.asin === asin);
      const date = formatDate(violation?.date ?? "N/A");
      const sku = asinSkuMap[asin] ?? "N/A";
      const rawCount = asinOrderCount[asin];
      let invoicePieces = "N/A";
      if (rawCount && rawCount !== "N/A") {
        const numericCount = parseInt(rawCount.replace(/[^0-9]/g, ""), 10);
        if (!Number.isNaN(numericCount)) {
          invoicePieces = numericCount === 0 ? "1" : Math.ceil(numericCount * 0.6).toString();
        }
      }
      return `ASIN:${asin} - SKU:${sku} - faktura vystavena před: ${date} - na faktuře alespoň ${invoicePieces} ks`;
    });
  }

  function downloadFiles(taskState) {
    const allResults = Array.isArray(taskState.violationsAllResults) ? taskState.violationsAllResults : [];
    const dateStr = new Date().toISOString().slice(0, 10);
    const BOM = "﻿";

    if (allResults.length > 0) {
      log(`Generuji multi-market CSV (${allResults.length} trzich)...`);

      const csvHeader = "Trh,ASIN,SKU,Datum violation,Typ violation,Pocet objednavek (365 dni)";
      const csvRows = [];
      for (const mr of allResults) {
        for (const violation of mr.violations) {
          csvRows.push([
            escapeCsv(mr.marketLabel),
            escapeCsv(violation.asin),
            escapeCsv(mr.asinSkuMap[violation.asin] ?? "N/A"),
            escapeCsv(violation.date),
            escapeCsv(violation.reason),
            escapeCsv(mr.asinOrderCount[violation.asin] ?? "N/A"),
          ].join(","));
        }
      }

      triggerDownload(
        new Blob([BOM + [csvHeader, ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" }),
        `amazon_violations_multi_${dateStr}.csv`
      );

      log("Generuji multi-market TXT soubor...");

      const allViolations = allResults.flatMap(mr => mr.violations);
      const allUniqueAsins = [...new Set(allResults.flatMap(mr => mr.uniqueAsins))];

      const txtLines = [];
      for (const mr of allResults) {
        if (mr.uniqueAsins.length > 0) {
          txtLines.push(`=== ${mr.marketLabel} ===`);
          txtLines.push(...buildTxtLines(mr.uniqueAsins, mr.violations, mr.asinSkuMap, mr.asinOrderCount));
          txtLines.push("");
        }
      }
      txtLines.push(...buildSummaryLines(allViolations, allUniqueAsins));

      triggerDownload(
        new Blob([BOM + txtLines.join("\n")], { type: "text/plain;charset=utf-8;" }),
        `amazon_violations_multi_${dateStr}.txt`
      );

      finish();
      return;
    }

    log("Generuji CSV soubor...");

    const csvHeader = "ASIN,SKU,Datum violation,Typ violation,Pocet objednavek (365 dni)";
    const csvRows = taskState.violations.map((violation) => [
      escapeCsv(violation.asin),
      escapeCsv(taskState.asinSkuMap[violation.asin] ?? "N/A"),
      escapeCsv(violation.date),
      escapeCsv(violation.reason),
      escapeCsv(taskState.asinOrderCount[violation.asin] ?? "N/A")
    ].join(","));

    triggerDownload(
      new Blob([BOM + [csvHeader, ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" }),
      `amazon_violations_${dateStr}.csv`
    );

    log("Generuji TXT soubor...");

    const txtLines = [
      ...buildTxtLines(taskState.uniqueAsins, taskState.violations, taskState.asinSkuMap, taskState.asinOrderCount),
      ...buildSummaryLines(taskState.violations, taskState.uniqueAsins),
    ];
    triggerDownload(
      new Blob([BOM + txtLines.join("\n")], { type: "text/plain;charset=utf-8;" }),
      `amazon_violations_${dateStr}.txt`
    );

    finish();
  }

  const response = await getTaskState();

  if (!response?.success) {
    return;
  }

  if (response.stage === "collectPolicy") {
    await collectPolicyRows();
    return;
  }

  const asin = response.uniqueAsins[response.asinIndex];

  if (response.stage === "collectOrders" && asin) {
    await collectOrderCount(asin);
    return;
  }

  if (response.stage === "collectInventory" && asin) {
    await collectInventorySku(asin);
    return;
  }

  if (response.stage === "downloadFiles") {
    downloadFiles(response);
  }
})();
