import { getDashboardSettings } from "./dashboardConfig.js";

function normalize(value) {
  return String(value || "").trim();
}

function getLicenseApiBaseUrl() {
  const settings = getDashboardSettings();
  const baseUrl = normalize(settings?.licenseApiBaseUrl).replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("License API base URL is not configured");
  }

  return baseUrl;
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postJson(path, body) {
  const baseUrl = getLicenseApiBaseUrl();
  const url = `${baseUrl}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body || {})
    });
  } catch (error) {
    throw new Error(`License server unreachable: ${error?.message || "network error"}`);
  }

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        data?.error ||
        data?.message ||
        `License server request failed (${response.status})`
    };
  }

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      status: response.status,
      error: "License server returned an invalid response"
    };
  }

  if (!data.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        data.error ||
        data.message ||
        "License server rejected the request"
    };
  }

  return {
    ...data,
    ok: true,
    status: response.status
  };
}

export async function activateLicense({ licenseKey, deviceId, deviceName }) {
  return await postJson("/activate", {
    license_key: normalize(licenseKey),
    device_id: normalize(deviceId),
    device_name: normalize(deviceName)
  });
}

export async function getLicenseStatus(token) {
  return await postJson("/status", {
    token: normalize(token)
  });
}

export async function refreshLicenseToken(token) {
  return await postJson("/refresh", {
    token: normalize(token)
  });
}