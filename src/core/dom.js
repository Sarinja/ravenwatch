export function getContent() {
  return document.getElementById("content");
}

export function getStatus() {
  return document.getElementById("status");
}

export function getRefreshBtn() {
  return document.getElementById("refresh");
}

export function getToggleTopBtn() {
  return document.getElementById("toggleTop");
}

export function getHeaderControls() {
  return document.querySelector(".controls");
}

export function getNavButtons() {
  return Array.from(document.querySelectorAll("nav button[data-tab]"));
}
