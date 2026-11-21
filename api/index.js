function parseTikTokProfile(html) {
  const m1 = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m1 && m1[1]) {
    try {
      const json = JSON.parse(m1[1]);
      const detail = json?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
      if (detail && detail.user) {
        return { user: detail.user, stats: detail.stats || detail.statsV2 || {} };
      }
    } catch (_) {}
  }

  const m2 = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (m2 && m2[1]) {
    try {
      const json = JSON.parse(m2[1]);
      const uMap = json?.UserModule?.users || {};
      const sMap = json?.UserModule?.stats || {};
      const key = Object.keys(uMap)[0];
      if (key && uMap[key]) {
        return { user: uMap[key], stats: sMap[key] || {} };
      }
    } catch (_) {}
  }

  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const target = req.query.url;
  const user = req.query.user;

  if (!target && !user) {
    return res.status(400).json({ code: -1, msg: "Thieu tham so ?url= hoac ?user=" });
  }

  // 1. Lấy hồ sơ trang cá nhân TikTok (?user=username)
  if (user) {
    const cleanUser = String(user).replace(/^@/, "").trim();
    const attempts = [
      {
        url: `https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Upgrade-Insecure-Requests": "1",
        },
      },
      {
        url: `https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`,
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9",
        },
      },
      {
        url: `https://www.tiktok.com/embed/@${encodeURIComponent(cleanUser)}`,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Referer": "https://www.tiktok.com/",
        },
      },
    ];

    for (const a of attempts) {
      try {
        const r = await fetch(a.url, { headers: a.headers, redirect: "follow" });
        const html = await r.text();
        const data = parseTikTokProfile(html);
        if (data) {
          return res.status(200).json({ code: 0, msg: "success", data });
        }
      } catch (_) {}
    }

    return res.status(200).json({ code: -1, msg: "TikTok dang bat captcha voi IP Vercel, thu lai sau vai giay" });
  }

  // 2. Lấy video / ảnh slide TikTok (?url=...)
  try {
    const body = new URLSearchParams({ url: target });
    const response = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body,
    });
    const text = await response.text();
    return res.status(response.status).send(text);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
