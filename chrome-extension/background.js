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
  const now = new Date();
  const wibOffset = 7 * 60;
  const utcOffset = now.getTimezoneOffset();
  const totalOffset = wibOffset + utcOffset;

  const resetHour = 7;
  let nextReset = new Date(now);
  nextReset.setMinutes(nextReset.getMinutes() + totalOffset);
  nextReset.setHours(resetHour, 0, 0, 0);

  if (nextReset.getTime() <= now.getTime() + totalOffset * 60 * 1000) {
    nextReset.setDate(nextReset.getDate() + 1);
  }

  const delayMs = nextReset.getTime() - (now.getTime() + totalOffset * 60 * 1000);

  chrome.alarms.create(RESET_ALARM, {
    delayInMinutes: delayMs / 60000
  });
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
