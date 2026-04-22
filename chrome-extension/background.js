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

      emails.forEach((email) => {
        const exists = history.find((e) => e.email === email);
        if (!exists) {
          history.unshift({ email, time: now, date: today });
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
