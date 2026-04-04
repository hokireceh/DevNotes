// Mock chrome API for preview purposes (not needed in actual extension)
(function () {
  if (typeof chrome !== "undefined") return;

  const storage = {};
  const alarmListeners = [];

  window.chrome = {
    storage: {
      local: {
        get(keys, cb) {
          const result = {};
          if (typeof keys === "string") {
            result[keys] = storage[keys];
          } else if (Array.isArray(keys)) {
            keys.forEach((k) => (result[k] = storage[k]));
          } else if (typeof keys === "object") {
            Object.keys(keys).forEach((k) => {
              result[k] = storage[k] !== undefined ? storage[k] : keys[k];
            });
          }
          setTimeout(() => cb(result), 10);
        },
        set(obj, cb) {
          Object.assign(storage, obj);
          if (cb) setTimeout(cb, 10);
        }
      }
    },
    tabs: {
      query(opts, cb) {
        setTimeout(
          () => cb([{ id: 1, url: window.location.href, title: document.title }]),
          10
        );
      },
      sendMessage(tabId, msg, cb) {
        if (msg.type === "SCAN_EMAILS") {
          const emails = ["demo@example.com", "user@replit.com", "dev@test.id"];
          setTimeout(() => cb && cb({ emails }), 200);
        }
        if (msg.type === "SCAN_MEDIA") {
          // Demo media data for preview — simulates Telegram Web scenario
          setTimeout(() => cb && cb({
            videos: [
              {
                src: "https://www.w3schools.com/html/mov_bbb.mp4",
                type: "video",
                label: "mov_bbb.mp4",
                thumb: null
              }
            ],
            images: [
              {
                src: "https://picsum.photos/seed/1/300/200",
                type: "image",
                label: "telegram_photo_1.jpg",
                thumb: "https://picsum.photos/seed/1/300/200"
              },
              {
                src: "https://picsum.photos/seed/5/300/200",
                type: "image",
                label: "telegram_photo_2.jpg",
                thumb: "https://picsum.photos/seed/5/300/200"
              }
            ],
            audios: [
              {
                src: "https://www.w3schools.com/html/horse.mp3",
                type: "audio",
                label: "voice_message.ogg"
              }
            ],
            // MSE capture — simulates Telegram video streaming being intercepted
            mseCaptures: [
              {
                key: "mse_1712345678_abc",
                mime: "video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"",
                totalSize: 8543210
              },
              {
                key: "mse_1712345679_def",
                mime: "video/webm; codecs=\"vp9\"",
                totalSize: 3221456
              }
            ],
            // Blob captures — simulates small blobs created by createObjectURL
            blobCaptures: [
              {
                blobUrl: "blob:https://web.telegram.org/voice-123",
                size: 245760,
                mime: "audio/ogg",
                kind: "audio",
                label: "voice_note_245KB.ogg"
              }
            ],
            // Direct CDN URLs intercepted from fetch/XHR
            directUrls: [
              {
                url: "https://cdn4.telegram-cdn.org/file/abcdef1234567890.mp4",
                label: "abcdef1234567890.mp4"
              }
            ],
            hasBlob: true
          }), 400);
        }
        if (msg.type === "REQUEST_DOWNLOAD") {
          // Simulate download ready
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: "MEDIA_DOWNLOAD_READY",
              data: {
                type: "mse_ready_download",
                url: "https://www.w3schools.com/html/mov_bbb.mp4",
                label: "telegram_video.mp4",
                size: 8543210
              }
            });
          }, 1500);
          cb && cb({ ok: true });
        }
      }
    },
    runtime: {
      sendMessage(msg, cb) {
        if (msg.type === "GET_NEXT_RESET") {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          setTimeout(() => cb && cb({ scheduledTime: tomorrow.getTime() }), 10);
        } else if (msg.type === "ADD_EMAILS") {
          setTimeout(() => cb && cb({ success: true }), 10);
        }
      }
    }
  };
})();
