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

async function fetchWithTimeout(url, options = {}, ms = 4500) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Nguồn 1: TikWM
async function fromTikwm(target) {
  const body = new URLSearchParams({ url: target, hd: "1" });
  const r = await fetchWithTimeout("https://www.tikwm.com/api/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body,
  }, 4500);
  if (!r.ok) throw new Error(`tikwm HTTP ${r.status}`);
  const j = await r.json();
  if (!j || j.code !== 0 || !j.data) throw new Error("tikwm empty");
  return j;
}

// Nguồn 2: TiklyDown (chuẩn hóa về đúng khung JSON của TikWM)
async function fromTiklyDown(target) {
  const r = await fetchWithTimeout(
    `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(target)}`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
    4500
  );
  if (!r.ok) throw new Error(`tiklydown HTTP ${r.status}`);
  const d = await r.json();
  const play = d?.video?.noWatermark || d?.video?.watermark;
  const images = Array.isArray(d?.images) ? d.images.map((x) => (typeof x === "string" ? x : x.url)).filter(Boolean) : [];
  if (!play && !images.length) throw new Error("tiklydown empty");

  return {
    code: 0,
    msg: "success (tiklydown)",
    data: {
      title: d.title || "",
      duration: d?.video?.duration || 0,
      play: play || "",
      wmplay: d?.video?.watermark || play || "",
      hdplay: d?.video?.noWatermark || play || "",
      images: images.length ? images : undefined,
      play_count: d?.stats?.playCount ?? null,
      digg_count: d?.stats?.likeCount ?? null,
      comment_count: d?.stats?.commentCount ?? null,
      share_count: d?.stats?.shareCount ?? null,
      collect_count: d?.stats?.saveCount ?? null,
      author: {
        nickname: d?.author?.name || "Không rõ",
        unique_id: d?.author?.unique_id || "",
      },
    },
  };
}

// Nguồn 3: Gọi thẳng API TikTok từ cụm Singapore (không phụ thuộc bên thứ 3)
async function fromTikTokDirect(target) {
  let finalUrl = target;
  if (!/\/(video|photo)\/\d+/.test(finalUrl)) {
    const r = await fetchWithTimeout(target, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)" },
    }, 3500);
    finalUrl = r.url || target;
  }
  const m = finalUrl.match(/\/(?:video|photo)\/(\d+)/);
  if (!m) throw new Error("no aweme_id");
  const id = m[1];

  const apiRes = await fetchWithTimeout(
    `https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/?aweme_id=${id}`,
    { headers: { "User-Agent": "com.zhiliaoapp.musically/2023501030 (Linux; U; Android 13)" } },
    4000
  );
  if (!apiRes.ok) throw new Error(`tiktok direct HTTP ${apiRes.status}`);
  const j = await apiRes.json();
  const item = (j?.aweme_list || []).find((x) => String(x.aweme_id) === id) || j?.aweme_list?.[0];
  if (!item) throw new Error("tiktok direct empty");

  const images = (item?.image_post_info?.images || [])
    .map((img) => img?.display_image?.url_list?.[0])
    .filter(Boolean);
  const play = item?.video?.play_addr?.url_list?.[0] || "";
  const wmplay = item?.video?.download_addr?.url_list?.[0] || play;
  if (!play && !images.length) throw new Error("no media");

  return {
    code: 0,
    msg: "success (direct)",
    data: {
      title: item.desc || "",
      duration: Math.round((item?.video?.duration || 0) / 1000),
      play,
      wmplay,
      hdplay: play,
      images: images.length ? images : undefined,
      play_count: item?.statistics?.play_count ?? null,
      digg_count: item?.statistics?.digg_count ?? null,
      comment_count: item?.statistics?.comment_count ?? null,
      share_count: item?.statistics?.share_count ?? null,
      collect_count: item?.statistics?.collect_count ?? null,
      author: {
        nickname: item?.author?.nickname || "Không rõ",
        unique_id: item?.author?.unique_id || "",
      },
    },
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const target = req.query.url;
  const user = req.query.user;

  if (!target && !user) {
    return res.status(400).json({ code: -1, msg: "Thieu tham so ?url= hoac ?user=" });
  }

  // 1. Hồ sơ TikTok — chạy song song 3 luồng, luồng nào xong trước trả ngay
  if (user) {
    const cleanUser = String(user).replace(/^@/, "").trim();
    const attempts = [
      {
        url: `https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
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

    try {
      const data = await Promise.any(
        attempts.map(async (a) => {
          const r = await fetchWithTimeout(a.url, { headers: a.headers, redirect: "follow" }, 5000);
          const html = await r.text();
          const parsed = parseTikTokProfile(html);
          if (!parsed) throw new Error("no data");
          return parsed;
        })
      );
      return res.status(200).json({ code: 0, msg: "success", data });
    } catch (_) {
      return res.status(200).json({ code: -1, msg: "TikTok dang bat captcha voi IP Vercel" });
    }
  }

  // 2. Video / ảnh slide TikTok (TikWM -> dự phòng song song TiklyDown + TikTok Direct)
  try {
    const data = await fromTikwm(target);
    return res.status(200).json(data);
  } catch (e1) {
    try {
      const fallback = await Promise.any([
        fromTiklyDown(target),
        fromTikTokDirect(target),
      ]);
      return res.status(200).json(fallback);
    } catch (e2) {
      return res.status(502).json({ code: -1, msg: `Tat ca nguon deu loi (${e1.message})` });
    }
  }
};
