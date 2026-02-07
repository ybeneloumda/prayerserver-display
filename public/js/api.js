function getApiBaseUrl() {
  const protocol = (window.location.protocol || "http:").replace(":", "");
  const host = window.location.hostname || "localhost";
  const port = window.location.port || "80";
  return `${protocol}://${host}:${port}`;
}

async function loadSettingsFromServer() {
  const res = await fetch(`${getApiBaseUrl()}/api/get-settings`);
  if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
  return await res.json();
}

async function saveSettingsToServer(settings) {
  const res = await fetch(`${getApiBaseUrl()}/api/save-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });

  if (!res.ok) throw new Error(`Failed to save settings (${res.status})`);
}

function getSetting(key, defaultValue) {
  if (!window.serverSettings || !(key in window.serverSettings)) {
    return defaultValue;
  }
  return window.serverSettings[key];
}

function setSetting(key, value) {
  if (!window.serverSettings) window.serverSettings = {};
  window.serverSettings[key] = value;

  // Fire and forget saves so UI updates remain responsive.
  saveSettingsToServer(window.serverSettings).catch((err) => {
    console.error("Could not save settings to database:", err);
  });
}

async function initServerSettings() {
  try {
    window.serverSettings = await loadSettingsFromServer();
  } catch (err) {
    console.error("Could not load settings from database:", err);
    window.serverSettings = {};
  }
}
