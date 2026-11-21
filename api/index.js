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
    const browserHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    // Cách 1: Đọc thẳng từ trang TikTok qua IP Vercel
    try {
      const r = await fetch(`https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`, {
        headers: browserHeaders,
        redirect: "follow",
      });
      const html = await r.text();

      const m1 = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (m1 && m1[1]) {
        const json = JSON.parse(m1[1]);
        const detail = json?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
        if (detail && detail.user) {
          return res.status(200).json({
            code: 0,
            msg: "success",
            data: { user: detail.user, stats: detail.stats || detail.statsV2 || {} },
          });
        }
      }

      const m2 = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
      if (m2 && m2[1]) {
        const json = JSON.parse(m2[1]);
        const uMap = json?.UserModule?.users || {};
        const sMap = json?.UserModule?.stats || {};
        const key = Object.keys(uMap)[0];
        if (key && uMap[key]) {
          return res.status(200).json({
            code: 0,
            msg: "success",
            data: { user: uMap[key], stats: sMap[key] || {} },
          });
        }
      }
    } catch (_) {}

    // Cách 2: Dự phòng gọi TikWM bằng GET + Referer
    try {
      const r = await fetch(
        `https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(cleanUser)}`,
        {
          method: "GET",
          headers: {
            "User-Agent": browserHeaders["User-Agent"],
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.tikwm.com/",
            "Origin": "https://www.tikwm.com",
          },
        }
      );
      if (r.ok) {
        const text = await r.text();
        return res.status(200).send(text);
      }
      return res.status(200).json({ code: -1, msg: `TikWM HTTP ${r.status}` });
    } catch (err) {
      return res.status(200).json({ code: -1, msg: err.message });
    }
  }

  // 2. Lấy video / ảnh slide TikTok (?url=...) — giữ nguyên như bản đang chạy ngon
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
