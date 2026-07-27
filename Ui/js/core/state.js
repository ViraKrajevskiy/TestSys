window.App = window.App || {};

App.state = {
  tabs: [],
  activeTabId: null,
  nextId: 1,
  isDetachedWindow: false,
};

App.DEMO_COLLECTION = [
  { method: "GET", name: "Users", url: "https://jsonplaceholder.typicode.com/users" },
  { method: "POST", name: "Create User", url: "https://jsonplaceholder.typicode.com/users" },
  { method: "PUT", name: "Update User", url: "https://jsonplaceholder.typicode.com/users/1" },
  { method: "DELETE", name: "Delete User", url: "https://jsonplaceholder.typicode.com/users/1" },
];

App.METHOD_COLOR_VAR = {
  GET: "--method-get",
  POST: "--method-post",
  PUT: "--method-put",
  PATCH: "--method-patch",
  DELETE: "--method-delete",
};
