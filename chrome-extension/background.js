const RESET_ALARM = "email-daily-reset";

chrome.runtime.onInstalled.addListener(() => {
  scheduleResetAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RESET_ALARM) {
    resetEmailHistory();
    scheduleResetAlarm();
  }
});

function scheduleResetAlarm() {
  // 07:00 WIB (Asia/Jakarta, UTC+7, no DST) === 00:00 UTC, every day.
  // Compute next 00:00 UTC strictly in UTC math so this is correct
  // regardless of the user's local device timezone.
  const nowMs = Date.now();
  const nowUtc = new Date(nowMs);
  let nextResetMs = Date.UTC(
    nowUtc.getUTCFullYear(),
    nowUtc.getUTCMonth(),
    nowUtc.getUTCDate(),
    0, 0, 0, 0
  );
  if (nextResetMs <= nowMs) {
    nextResetMs += 24 * 60 * 60 * 1000;
  }

  // chrome.alarms minimum in production is 30s (0.5 min)
  const delayInMinutes = Math.max(0.5, (nextResetMs - nowMs) / 60000);

  chrome.alarms.create(RESET_ALARM, { delayInMinutes });
}

function resetEmailHistory() {
  chrome.storage.local.set({
    emailHistory: [],
    emailHistoryDate: new Date().toLocaleDateString("id-ID")
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_NEXT_RESET") {
    chrome.alarms.get(RESET_ALARM, (alarm) => {
      if (alarm) {
        sendResponse({ scheduledTime: alarm.scheduledTime });
      } else {
        sendResponse({ scheduledTime: null });
      }
    });
    return true;
  }

  // Bypass page-context CORS by performing the download via the
  // service worker. chrome.downloads.download uses the browser network
  // stack, not the page's fetch context.
  // Docs: https://developer.chrome.com/docs/extensions/reference/api/downloads#method-download
  if (msg.type === "EXT_DOWNLOAD") {
    const url = typeof msg.url === "string" ? msg.url : "";
    if (!url || !/^https?:\/\//i.test(url)) {
      sendResponse({ ok: false, error: "Invalid url (http/https only)" });
      return true;
    }
    // Sanitize filename: strip path separators and reserved chars,
    // cap length. chrome.downloads rejects names containing ".." segments.
    let filename = String(msg.filename || "")
      .replace(/[\\/:*?"<>|\r\n\t]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 180);
    const opts = { url, conflictAction: "uniquify" };
    if (filename) opts.filename = filename;
    try {
      chrome.downloads.download(opts, (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err || downloadId === undefined) {
          sendResponse({ ok: false, error: err ? err.message : "downloadId missing" });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      });
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
    return true;
  }

  if (msg.type === "ADD_EMAILS") {
    const emails = msg.emails || [];
    if (emails.length === 0) {
      sendResponse({ success: true });
      return true;
    }

    chrome.storage.local.get(["emailHistory", "emailHistoryDate"], (data) => {
      const today = new Date().toLocaleDateString("id-ID");
      let history = [];

      if (data.emailHistoryDate === today) {
        history = data.emailHistory || [];
      }

      const now = new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta"
      });

      // Use a Set for O(1) dedup instead of O(n) Array#find per email
      // (overall O(n+m) vs previous O(n*m) on large incoming batches).
      const seen = new Set(history.map((e) => e.email));
      emails.forEach((email) => {
        if (!seen.has(email)) {
          history.unshift({ email, time: now, date: today });
          seen.add(email);
        }
      });

      chrome.storage.local.set({
        emailHistory: history,
        emailHistoryDate: today
      });

      sendResponse({ success: true });
    });
    return true;
  }
});
