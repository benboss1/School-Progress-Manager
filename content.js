(() => {
    "use strict";
  
    // Only run on the exact gradebook/all page
    if (!location.href.match(/^https:\/\/epicschools\.agilixbuzz\.com\/student\/gradebook\/all/)) {
      return;
    }
  
    const MAX_RETRIES = 60;
    const RETRY_MS = 1000;
  
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cleanText = (s) => (s || "").replace(/\s+/g, " ").trim();
  
    function parseXofY(text) {
      const m = cleanText(text).match(/^(\d+)\s+of\s+(\d+)$/i);
      if (!m) return null;
      return { completed: Number(m[1]), total: Number(m[2]) };
    }
  
    function getTooltipTextById(descId) {
      if (!descId) return null;
      const el = document.getElementById(descId);
      return el ? cleanText(el.textContent) : null;
    }
  
    function scrape() {
      const rows = Array.from(document.querySelectorAll("mat-row, .mat-mdc-row"));
      if (!rows.length) return { ok: false, reason: "No rows found yet." };
  
      const courses = [];
  
      for (const row of rows) {
        const courseA = row.querySelector(".cdk-column-course a, .mat-column-course a");
        const course = cleanText(courseA?.textContent);
  
        const start = cleanText(
          row.querySelector(".cdk-column-start .start-date, .mat-column-start .start-date")?.textContent
        );
        const end = cleanText(
          row.querySelector(".cdk-column-end .end-date, .mat-column-end .end-date")?.textContent
        );
  
        const scorePercentText = cleanText(
          row.querySelector(".cdk-column-score .percent, .mat-column-score .percent")?.textContent
        );
        const scorePercent = scorePercentText ? Number(scorePercentText.replace("%", "").trim()) : null;
  
        const pb = row.querySelector(".cdk-column-progress mat-progress-bar, .mat-column-progress mat-progress-bar");
        const progressPercent = pb?.getAttribute("aria-valuenow")
          ? Number(pb.getAttribute("aria-valuenow"))
          : null;
  
        const descId = pb?.getAttribute("aria-describedby");
        const xOfYText = getTooltipTextById(descId);
        const xOfY = xOfYText ? parseXofY(xOfYText) : null;
  
        if (course) {
          courses.push({
            course,
            startDate: start || null,
            endDate: end || null,
            scorePercent,
            progressPercent,
            assignments: xOfY
              ? { completed: xOfY.completed, total: xOfY.total, left: xOfY.total - xOfY.completed }
              : null
          });
        }
      }
  
      if (!courses.length) return { ok: false, reason: "Rows found but no course names parsed." };
  
      return {
        ok: true,
        scrapedAt: new Date().toISOString(),
        sourceUrl: location.href,
        courses
      };
    }
  
    function downloadJson(obj) {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "buzz-gradebook-progress.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  
    async function copyJson(obj) {
      const txt = JSON.stringify(obj, null, 2);
      // Firefox may require a user gesture; this is triggered by button click, so it usually works.
      await navigator.clipboard.writeText(txt);
    }
  
    function ensurePanel() {
      if (document.getElementById("buzz-export-panel")) return document.getElementById("buzz-export-status");
  
      const panel = document.createElement("div");
      panel.id = "buzz-export-panel";
      panel.style.cssText = `
        position: fixed; top: 14px; right: 14px; z-index: 999999;
        background: white; border: 1px solid rgba(0,0,0,.15);
        border-radius: 12px; padding: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
        font-family: system-ui, Arial; width: 270px;
      `;
  
      panel.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px;">Buzz Export (Private)</div>
        <div id="buzz-export-status" style="font-size:12px; color:#555; margin-bottom:8px;">
          Waiting for gradebook table…
        </div>
        <button id="buzz-copy" style="width:100%; padding:8px; margin-bottom:6px; cursor:pointer;">Copy JSON</button>
        <button id="buzz-dl" style="width:100%; padding:8px; cursor:pointer;">Download JSON</button>
        <div style="font-size:11px; color:#777; margin-top:8px; line-height:1.25;">
          No passwords. Reads only the page you’re already logged into.
        </div>
      `;
  
      document.body.appendChild(panel);
  
      const status = panel.querySelector("#buzz-export-status");
      panel.querySelector("#buzz-copy").addEventListener("click", async () => {
        const res = scrape();
        if (!res.ok) return alert("Not ready: " + res.reason);
        try {
          await copyJson(res);
          status.textContent = "Copied JSON to clipboard ✅";
        } catch (e) {
          alert("Clipboard blocked. Use Download JSON instead.\n\n" + e);
        }
      });
  
      panel.querySelector("#buzz-dl").addEventListener("click", () => {
        const res = scrape();
        if (!res.ok) return alert("Not ready: " + res.reason);
        downloadJson(res);
        status.textContent = "Downloaded JSON ✅";
      });
  
      return status;
    }
  
    async function boot() {
      const status = ensurePanel();
  
      for (let i = 0; i < MAX_RETRIES; i++) {
        const res = scrape();
        if (res.ok) {
          status.textContent = `Ready ✅ Found ${res.courses.length} courses.`;
          return;
        }
        status.textContent = `Waiting for gradebook table… (${i + 1}/${MAX_RETRIES})`;
        await sleep(RETRY_MS);
      }
  
      status.textContent = "Couldn’t detect the table. Refresh and try again.";
    }
  
    boot();
  })();  