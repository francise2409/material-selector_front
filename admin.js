/* =========================================================================
   Trang quản lý user — chỉ role "admin" dùng được.
   Dùng chung Auth / apiGet / apiPost / apiDelete từ auth-client.js.
   ========================================================================= */

function onAuthReady() {
  // trang này show/hide theo role, không cần làm gì thêm ở đây
}

async function loadUsers() {
  const listMsg = $("listMsg");
  listMsg.className = "msg"; listMsg.style.display = "none";
  try {
    const data = await apiGet("/api/admin/users");
    $("userRows").innerHTML = data.users.map((u) => `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td style="text-align:right">
          ${u.username === Auth.username ? "" : `<button class="btn btn-del" data-u="${escapeHtml(u.username)}">Xoá</button>`}
        </td>
      </tr>`).join("");
    $("userRows").querySelectorAll(".btn-del").forEach((b) => b.onclick = () => deleteUser(b.dataset.u));
  } catch (err) {
    listMsg.textContent = "Lỗi tải danh sách: " + err.message;
    listMsg.className = "msg err";
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function deleteUser(username) {
  if (!confirm(`Xoá tài khoản "${username}"? Không thể hoàn tác.`)) return;
  try {
    await apiDelete(`/api/admin/users/${encodeURIComponent(username)}`);
    loadUsers();
  } catch (err) {
    alert("Không xoá được: " + err.message);
  }
}

$("addUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const addMsg = $("addMsg");
  addMsg.className = "msg"; addMsg.style.display = "none";
  const username = $("newUsername").value.trim();
  const password = $("newPassword").value;
  const role = $("newRole").value;
  try {
    const res = await apiPost("/api/admin/users", { username, password, role });
    addMsg.textContent = res.message;
    addMsg.className = "msg ok";
    $("addUserForm").reset();
    loadUsers();
  } catch (err) {
    addMsg.textContent = "Lỗi: " + err.message;
    addMsg.className = "msg err";
  }
});

async function boot() {
  $("mainContent").style.display = "block";
  if (Auth.role !== "admin") {
    $("notAdminCard").style.display = "block";
    $("curRole").textContent = Auth.role || "(không xác định)";
    $("adminArea").style.display = "none";
    return;
  }
  $("notAdminCard").style.display = "none";
  $("adminArea").style.display = "block";
  loadUsers();
}

initAuthOnLoad();
