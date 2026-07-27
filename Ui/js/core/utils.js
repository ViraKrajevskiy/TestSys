window.App = window.App || {};

App.escapeHtml = function (str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

App.escapeAttr = function (str) {
  return App.escapeHtml(str).replace(/"/g, "&quot;");
};
