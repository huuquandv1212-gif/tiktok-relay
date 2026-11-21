module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const target = req.query.url;
  const user = req.query.user;

  if (!target && !user) {
    return res.status(400).json({ error: "Thieu tham so ?url= hoac ?user=" });
  }

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  try {
    const endpoint = user
      ? "https://www.tikwm.com/api/user/info"
      : "https://www.tikwm.com/api/";
    const body = user
      ? new URLSearchParams({ unique_id: String(user).replace(/^@/, "").trim() })
      : new URLSearchParams({ url: target });

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });

    const text = await response.text();
    return res.status(response.status).send(text);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
