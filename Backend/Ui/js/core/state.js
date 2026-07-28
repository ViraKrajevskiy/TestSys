window.App = window.App || {};

App.state = {
  tabs: [],
  activeTabId: null,
  nextId: 1,
  isDetachedWindow: false,
  expandedFolders: { "JSONPlaceholder::Users": true },
};

App.VARIABLES = {
  baseUrl: "https://jsonplaceholder.typicode.com",
  userId: "1",
};

App.USER_BODY_TEMPLATE = JSON.stringify({
  name: "John Doe",
  username: "johnd",
  email: "john@example.com",
  phone: "1-234-567-8900",
  website: "johndoe.com",
}, null, 2);

App.COLLECTIONS = [
  {
    name: "JSONPlaceholder",
    folders: [
      {
        name: "Users",
        entity: "user",
        items: [
          { method: "GET", name: "List All", url: "{{baseUrl}}/users", crud: "list" },
          { method: "GET", name: "Get by ID", url: "{{baseUrl}}/users/{{userId}}", crud: "read" },
          { method: "POST", name: "Create", url: "{{baseUrl}}/users", crud: "create", body: App.USER_BODY_TEMPLATE },
          { method: "PUT", name: "Update", url: "{{baseUrl}}/users/{{userId}}", crud: "update", body: App.USER_BODY_TEMPLATE },
          { method: "DELETE", name: "Delete", url: "{{baseUrl}}/users/{{userId}}", crud: "delete" },
        ],
      },
    ],
  },
];

App.METHOD_COLOR_VAR = {
  GET: "--method-get",
  POST: "--method-post",
  PUT: "--method-put",
  PATCH: "--method-patch",
  DELETE: "--method-delete",
  USERS: "--method-post", // Use POST color for Users
};

App.USER_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "username", label: "Username", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
];