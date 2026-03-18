(async function() {
  "use strict";

  const DELAY_MS = 4000;
  const TARGET_REASONS = [
    "counterfeit without a test buy",
    "trademark on product"
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

  async function collectPolicyRows() {
    log("Cekam na nacteni stranky policy (8 s)...");
    await sleep(8000);

    for (let attempt = 0; attempt < 10; attempt++) {
      const rows = document.querySelectorAll(".ahd-product-policy-table-row");

      if (rows.length > 0) {
        const violations = [];

        rows.forEach((row) => {
          const cols = Array.from(row.children);
          const reasonRaw = cols[0]?.textContent?.trim() || "";
          const date = cols[1]?.textContent?.trim() || "";
          let asin = "";

          for (const span of row.querySelectorAll("span")) {
            const text = span.textContent.trim();

            if (text.startsWith("ASIN:")) {
              asin = text.replace("ASIN:", "").trim();
              break;
            }
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

        log(`Celkem cilovych violations: ${violations.length}`);
        chrome.runtime.sendMessage({ type: "VIOLATIONS_POLICY_COLLECTED", violations });
        return;
      }

      log(`DOM jeste neni pripraven, cekam... (${attempt + 1}/10)`);
      await sleep(2000);
    }

    chrome.runtime.sendMessage({ type: "VIOLATIONS_POLICY_COLLECTED", violations: [] });
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

  function downloadFiles(taskState) {
    log("Generuji CSV soubor...");

    const csvHeader = "ASIN,SKU,Datum violation,Typ violation,Pocet objednavek (365 dni)";
    const csvRows = taskState.violations.map((violation) => [
      escapeCsv(violation.asin),
      escapeCsv(taskState.asinSkuMap[violation.asin] ?? "N/A"),
      escapeCsv(violation.date),
      escapeCsv(violation.reason),
      escapeCsv(taskState.asinOrderCount[violation.asin] ?? "N/A")
    ].join(","));

    const csvBlob = new Blob(["\uFEFF" + [csvHeader, ...csvRows].join("\n")], {
      type: "text/csv;charset=utf-8;"
    });
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement("a");
    csvLink.href = csvUrl;
    csvLink.download = `amazon_violations_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(csvLink);
    csvLink.click();
    document.body.removeChild(csvLink);
    URL.revokeObjectURL(csvUrl);

    log("Generuji TXT soubor...");

    const txtLines = taskState.uniqueAsins.map((asin) => {
      const violation = taskState.violations.find((entry) => entry.asin === asin);
      const date = violation?.date ?? "N/A";
      const sku = taskState.asinSkuMap[asin] ?? "N/A";
      const rawCount = taskState.asinOrderCount[asin];
      let sixtyPercent = "N/A";

      if (rawCount && rawCount !== "N/A") {
        const numericCount = parseInt(rawCount.replace(/[^0-9]/g, ""), 10);

        if (!Number.isNaN(numericCount)) {
          sixtyPercent = Math.ceil(numericCount * 0.6).toString();
        }
      }

      return `ASIN:${asin} - SKU:${sku} - faktura vystavena před: ${date} - na faktuře alespoň ${sixtyPercent} ks`;
    });

    const txtBlob = new Blob(["\uFEFF" + txtLines.join("\n")], {
      type: "text/plain;charset=utf-8;"
    });
    const txtUrl = URL.createObjectURL(txtBlob);
    const txtLink = document.createElement("a");
    txtLink.href = txtUrl;
    txtLink.download = `amazon_violations_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(txtLink);
    txtLink.click();
    document.body.removeChild(txtLink);
    URL.revokeObjectURL(txtUrl);

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
