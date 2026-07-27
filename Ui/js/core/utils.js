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

App.resolveVariables = function (str) {
  return String(str || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(App.VARIABLES, key) ? App.VARIABLES[key] : `{{${key}}}`;
  });
};

App.tryParseJson = function (text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

App.formatJson = function (text) {
  const parsed = App.tryParseJson(text);
  if (parsed === null) return text;
  return JSON.stringify(parsed, null, 2);
};
