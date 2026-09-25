/* =========================================================================
   Auth client dùng chung cho index.html (tra cứu) và admin.html (quản lý user)
   =========================================================================
   Yêu cầu mỗi trang include TRƯỚC file này:
     <script src="config.js"></script>
   Và có sẵn trong DOM: #loginOverlay #loginForm #loginUser #loginPass
   #loginError #whoami #logoutBtn
   ========================================================================= */

const $ = (id) => document.getElementById(id);

const Auth = {
  get token() { return localStorage.getItem("ms_token"); },
  get username() { return localStorage.getItem("ms_username") || ""; },
  get role() { return localStorage.getItem("ms_role") || ""; },
  set({ token, username, role }) {
    localStorage.setItem("ms_token", token);
    localStorage.setItem("ms_username", username);
    localStorage.setItem("ms_role", role);
  },
  clear() {
    localStorage.removeItem("ms_token");
    localStorage.removeItem("ms_username");
    localStorage.removeItem("ms_role");
  },
  isLoggedIn() { return !!this.token; },
};

function showLogin(message) {
  $("loginOverlay").style.display = "flex";
  if (message) {
    $("loginError").textContent = message;
    $("loginError").style.display = "block";
  } else {
    $("loginError").style.display = "none";
  }
}
function hideLogin() { $("loginOverlay").style.display = "none"; }

function updateWhoAmI() {
  if (Auth.isLoggedIn()) {
    $("whoami").textContent = `${Auth.username} (${Auth.role === "admin" ? "admin" : "guest"})`;
    $("logoutBtn").style.display = "inline-block";
    if (typeof onAuthReady === "function") onAuthReady();
  } else {
    $("whoami").textContent = "";
    $("logoutBtn").style.display = "none";
  }
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").style.display = "none";
  const username = $("loginUser").value.trim();
  const password = $("loginPass").value;
  try {
    const res = await fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!res.ok) { showLogin(json.detail || "Đăng nhập thất bại"); return; }
    Auth.set(json);
    $("loginPass").value = "";
    hideLogin();
    updateWhoAmI();
    if (typeof boot === "function") boot();
  } catch (err) {
    showLogin("Không kết nối được backend API. Kiểm tra config.js.");
    console.error(err);
  }
});
$("logoutBtn").onclick = () => { Auth.clear(); updateWhoAmI(); showLogin(); };

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Auth.token}` },
    body: JSON.stringify(body || {}),
  });
  if (res.status === 401) { Auth.clear(); showLogin("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại."); throw new Error("401"); }
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `API ${path} failed: ${res.status}`); }
  return res.json();
}
async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: { "Authorization": `Bearer ${Auth.token}` } });
  if (res.status === 401) { Auth.clear(); showLogin("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại."); throw new Error("401"); }
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `API ${path} failed: ${res.status}`); }
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: "DELETE", headers: { "Authorization": `Bearer ${Auth.token}` } });
  if (res.status === 401) { Auth.clear(); showLogin("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại."); throw new Error("401"); }
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `API ${path} failed: ${res.status}`); }
  return res.json();
}

// Gọi lúc trang vừa load: nếu đã có token từ trước (đăng nhập ở trang kia), vào thẳng luôn.
function initAuthOnLoad() {
  if (Auth.isLoggedIn()) {
    hideLogin();
    updateWhoAmI();
    if (typeof boot === "function") boot();
  } else {
    showLogin();
  }
}
