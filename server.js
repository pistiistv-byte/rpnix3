import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));

async function safeJson(url, options = {}) {
  try {
    const r = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        ...(options.headers || {})
      }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function getAvatar(userId) {
  const urls = [
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
    `https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
  ];

  for (const url of urls) {
    const j = await safeJson(url);
    const img = j?.data?.[0]?.imageUrl;
    if (img) return img;
  }

  return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;
}

async function getUserDetails(userIds) {
  if (!userIds.length) return new Map();

  const ids = userIds.slice(0, 25);
  const urls = [
    `https://users.roblox.com/v1/users?userIds=${ids.join(",")}`,
    `https://users.roproxy.com/v1/users?userIds=${ids.join(",")}`
  ];

  for (const url of urls) {
    const j = await safeJson(url);
    if (j?.data) {
      return new Map(j.data.map(u => [u.id, u]));
    }
  }

  return new Map();
}

app.get("/api/roblox-users", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const username = String(req.query.username || "").trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
  if (username.length < 3) return res.json({ users: [] });

  const found = new Map();

  async function add(user) {
    if (!user || !user.id || !user.name || found.has(user.id)) return;
    found.set(user.id, {
      id: user.id,
      name: user.name,
      displayName: user.displayName || user.name
    });
  }

  const usernameBody = {
    usernames: [username],
    excludeBannedUsers: false
  };

  for (const url of ["https://users.roblox.com/v1/usernames/users", "https://users.roproxy.com/v1/usernames/users"]) {
    const j = await safeJson(url, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(usernameBody)
    });
    for (const u of (j?.data || [])) await add(u);
  }

  for (const url of [
    `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=20`,
    `https://users.roproxy.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=20`
  ]) {
    const j = await safeJson(url);
    for (const u of (j?.data || [])) await add(u);
  }

  const users = Array.from(found.values());
  const details = await getUserDetails(users.map(u => u.id));

  for (const u of users) {
    const d = details.get(u.id);
    if (d?.created) {
      const y = new Date(d.created).getFullYear();
      if (!Number.isNaN(y)) u.createdYear = y;
    }
    u.avatar = await getAvatar(u.id);
  }

  users.sort((a,b)=>{
    const aq = a.name.toLowerCase() === username.toLowerCase() ? 0 : 1;
    const bq = b.name.toLowerCase() === username.toLowerCase() ? 0 : 1;
    return aq - bq || a.name.localeCompare(b.name);
  });

  res.json({ users });
});

app.get("*", (req, res) => res.sendFile(process.cwd() + "/index.html"));

app.listen(PORT, () => console.log("Running on port " + PORT));
