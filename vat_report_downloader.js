(async () => {
  "use strict";

  if (document.querySelector("meta[data-vat-report-dl]")) {
    console.warn("[VatReportDownloader] Already running.");
    return;
  }

  const marker = document.createElement("meta");
  marker.setAttribute("data-vat-report-dl", "1");
  document.head.appendChild(marker);

  const PARAMS_KEY = "_vatReportParams";
  const REPORT_ID = 89900;
  const POLL_INTERVAL_MS = 1000;
  const SUBMIT_DELAY_MS = 2000;
  const MAX_POLL_MS = 10 * 60 * 1000;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getCsrfToken() {
    return document.querySelector('meta[name="anti-csrftoken-a2z"]')?.content?.trim() || "";
  }

  async function sendMessage(payload) {
    try {
      await chrome.runtime.sendMessage(payload);
    } catch (error) {
      console.warn("[VatReportDownloader] Failed to send message:", error);
    }
  }

  async function sendProgress(progress) {
    await sendMessage({ type: "VAT_REPORT_PROGRESS", progress });
  }

  async function fail(error, progress) {
    const message = error?.message || String(error) || "VAT export failed.";
    await sendProgress({
      ...(progress || {}),
      active: false,
      phase: "error",
      error: message,
      message: ""
    });
    await sendMessage({ type: "VAT_REPORT_ERROR", error: message });
  }

  async function submitMonthlyReport(monthEntry) {
    const token = getCsrfToken();
    if (!token) {
      throw new Error("Missing anti-csrftoken-a2z token.");
    }

    const url = new URL("/reportcentral/api/v1/submitDownloadReport", location.origin);
    url.searchParams.set("reportFileFormat", "CSV");
    url.searchParams.set("reportStartDate", monthEntry.start);
    url.searchParams.set("reportEndDate", monthEntry.end);
    url.searchParams.set("xdaysBeforeUntilToday", "-1");
    url.searchParams.set("startDateTimeOffset", "0");
    url.searchParams.set("endDateTimeOffset", "0");
    url.searchParams.set("specialDateOptions", "");
    url.searchParams.set("reportFRPId", String(REPORT_ID));
    url.searchParams.set("language", "");
    url.searchParams.set("disableTimezone", "true");

    let response;
    for (let attempt = 1; attempt <= 5; attempt++) {
      response = await fetch(url.toString(), {
        method: "POST",
        credentials: "include",
        headers: {
          "anti-csrftoken-a2z": token
        }
      });
      if (response.status !== 429) break;
      if (attempt < 5) await sleep(attempt * 5000);
    }

    if (!response.ok) {
      throw new Error(`Submit failed for ${monthEntry.label}: HTTP ${response.status}`);
    }

    const result = await response.json();
    if (!result?.reportReferenceId) {
      throw new Error(`Submit failed for ${monthEntry.label}: missing reference ID.`);
    }

    return result.reportReferenceId;
  }

  async function fetchStatuses(referenceIds) {
    const token = getCsrfToken();
    if (!token) {
      throw new Error("Missing anti-csrftoken-a2z token.");
    }

    const url = new URL("/reportcentral/api/v1/getDownloadReportStatus", location.origin);
    for (const referenceId of referenceIds) {
      url.searchParams.append("referenceIds", referenceId);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      headers: {
        "anti-csrftoken-a2z": token
      }
    });

    if (!response.ok) {
      throw new Error(`Status poll failed: HTTP ${response.status}`);
    }

    const statuses = await response.json();
    if (!Array.isArray(statuses)) {
      throw new Error("Status poll failed: invalid response payload.");
    }

    return statuses;
  }

  async function fetchCsvFile(referenceId, filename) {
    const url = new URL("/reportcentral/api/v1/downloadFile", location.origin);
    url.searchParams.set("referenceId", referenceId);
    url.searchParams.set("fileFormat", "CSV");

    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Download failed for ${filename}: HTTP ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  try {
    if (!location.pathname.includes("/reportcentral/VAT_TRANSACTION/1")) {
      throw new Error("Open the VAT Transaction page first.");
    }

    const result = await chrome.storage.local.get(PARAMS_KEY);
    const params = result[PARAMS_KEY];
    if (!params?.months?.length) {
      throw new Error("Missing VAT report parameters.");
    }

    const months = params.months.map((entry) => ({
      year: Number(entry.year),
      month: Number(entry.month),
      label: String(entry.label),
      start: String(entry.start),
      end: String(entry.end),
      filename: String(entry.filename)
    }));
    const progress = {
      active: true,
      phase: "submitting",
      message: `Submitting ${months.length} month(s)...`,
      totalMonths: months.length,
      submittedCount: 0,
      downloadedCount: 0,
      currentMonthLabel: "",
      pendingMonths: months.map((entry) => entry.label),
      downloadedMonths: [],
      rangeStart: params.startMonth,
      rangeEnd: params.endMonth,
      zipName: params.zipName,
      downloadMode: params.downloadMode,
      error: ""
    };

    await sendProgress(progress);

    const submitted = [];
    for (let index = 0; index < months.length; index += 1) {
      const monthEntry = months[index];
      progress.phase = "submitting";
      progress.currentMonthLabel = monthEntry.label;
      progress.message = `Submitting ${monthEntry.label} (${index + 1}/${months.length})...`;
      await sendProgress(progress);

      const referenceId = await submitMonthlyReport(monthEntry);
      submitted.push({ ...monthEntry, referenceId });

      progress.submittedCount = submitted.length;
      progress.pendingMonths = submitted.map((entry) => entry.label);
      progress.message = `Submitted ${submitted.length}/${months.length} month(s).`;
      await sendProgress(progress);

      if (index < months.length - 1) {
        await sleep(SUBMIT_DELAY_MS);
      }
    }

    const pendingByReferenceId = new Map(submitted.map((entry) => [entry.referenceId, entry]));
    const zipFiles = [];
    const individualFiles = [];
    const pollStartedAt = Date.now();

    while (pendingByReferenceId.size > 0) {
      if (Date.now() - pollStartedAt > MAX_POLL_MS) {
        throw new Error("Timed out while waiting for VAT reports to finish.");
      }

      const referenceIds = [...pendingByReferenceId.keys()];
      const statuses = await fetchStatuses(referenceIds);

      for (let index = 0; index < referenceIds.length; index += 1) {
        const referenceId = referenceIds[index];
        const status = String(statuses[index] || "");
        const monthEntry = pendingByReferenceId.get(referenceId);
        if (!monthEntry) continue;

        if (status === "Done") {
          progress.phase = "downloading";
          progress.currentMonthLabel = monthEntry.label;
          progress.message = `Downloading ${monthEntry.label}...`;
          await sendProgress(progress);

          if (params.downloadMode === "individual" || params.downloadMode === "both") {
            const downloadUrl = new URL("/reportcentral/api/v1/downloadFile", location.origin);
            downloadUrl.searchParams.set("referenceId", referenceId);
            downloadUrl.searchParams.set("fileFormat", "CSV");
            individualFiles.push({ url: downloadUrl.toString(), filename: monthEntry.filename });
          }

          if (params.downloadMode === "zip" || params.downloadMode === "both") {
            const fileData = await fetchCsvFile(referenceId, monthEntry.filename);
            zipFiles.push({ filename: monthEntry.filename, data: fileData });
          }

          pendingByReferenceId.delete(referenceId);
          progress.downloadedCount += 1;
          progress.downloadedMonths = [...progress.downloadedMonths, monthEntry.label];
          progress.pendingMonths = [...pendingByReferenceId.values()].map((entry) => entry.label);
          progress.currentMonthLabel = progress.pendingMonths[0] || "";
          progress.phase = pendingByReferenceId.size > 0 ? "waiting" : progress.phase;
          progress.message = pendingByReferenceId.size > 0
            ? `Waiting for ${pendingByReferenceId.size} month(s) to finish...`
            : `Downloaded ${progress.downloadedCount}/${progress.totalMonths} month(s).`;
          await sendProgress(progress);
        } else if (status === "Failed") {
          throw new Error(`Amazon returned Failed for ${monthEntry.label}.`);
        }
      }

      if (pendingByReferenceId.size > 0) {
        progress.phase = "waiting";
        progress.currentMonthLabel = progress.pendingMonths[0] || "";
        progress.message = `Waiting for ${pendingByReferenceId.size} month(s) to finish...`;
        await sendProgress(progress);
        await sleep(POLL_INTERVAL_MS);
      }
    }

    // Trigger all individual file downloads simultaneously at the end
    for (const file of individualFiles) {
      await sendMessage({ type: "VAT_REPORT_FILE_READY", url: file.url, filename: file.filename });
    }

    if ((params.downloadMode === "zip" || params.downloadMode === "both") && zipFiles.length > 0) {
      progress.phase = "zipping";
      progress.currentMonthLabel = "";
      progress.message = `Creating ZIP from ${zipFiles.length} file(s)...`;
      await sendProgress(progress);
      await sendMessage({
        type: "VAT_REPORT_ZIP_READY",
        files: zipFiles,
        zipName: params.zipName
      });
    }

    await sendProgress({
      ...progress,
      active: false,
      phase: "done",
      currentMonthLabel: "",
      pendingMonths: [],
      message: `Done. ${progress.downloadedCount}/${progress.totalMonths} month(s) processed.`,
      error: ""
    });
    await sendMessage({ type: "VAT_REPORT_DONE", count: progress.downloadedCount });
  } catch (error) {
    await fail(error, {
      active: true,
      phase: "error",
      totalMonths: 0,
      submittedCount: 0,
      downloadedCount: 0,
      currentMonthLabel: "",
      pendingMonths: [],
      downloadedMonths: [],
      rangeStart: "",
      rangeEnd: "",
      zipName: "",
      downloadMode: "zip",
      error: ""
    });
  } finally {
    marker.remove();
  }
})();
