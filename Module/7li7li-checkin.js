// ============================================================
// 7li7li杂货铺 每日签到脚本 (Egern Schedule)
// 由 7li7li-checkin.yaml 模块调用
// ============================================================
// cookie 获取顺序: storage(getcookie 自动捕获) → env(模块 UI 填写)
// ============================================================

export default async function(ctx) {
  const BASE_URL = 'https://store.7li7li.com';

  // ---- 获取凭据: env 优先(模块 UI 手填, 已验证), storage 仅作回退 ----
  const sessionToken =
    ctx.env.SESSION_TOKEN || ctx.storage.get('session_token') || '';
  const csrfToken =
    ctx.env.CSRF_TOKEN || ctx.storage.get('csrf_token') || '';
  const callbackUrl =
    ctx.env.CALLBACK_URL ||
    ctx.storage.get('callback_url') ||
    'https%3A%2F%2Fstore.7li7li.com%2F';

  // 检查凭据是否已配置
  if (!sessionToken || !csrfToken) {
    const msg = `未配置 cookie: env.SESSION_TOKEN=${ctx.env.SESSION_TOKEN ? '有值(' + ctx.env.SESSION_TOKEN.slice(0, 15) + '...)' : '空'} / env.CSRF_TOKEN=${ctx.env.CSRF_TOKEN ? '有值' : '空'} / storage=${ctx.storage.get('session_token') ? '有值' : '空'}`;
    ctx.notify({
      title: '7li7li 签到配置错误',
      body: msg,
      action: { type: 'openUrl', url: 'https://store.7li7li.com/' },
    });
    return;
  }

  // 【诊断】通知中显示实际使用的 token 前缀，用于排查
  ctx.notify({
    title: '7li7li 诊断',
    body: `本次将使用 SESSION_TOKEN 前缀: ${sessionToken.slice(0, 20)}...\n长度: ${sessionToken.length}\n来源: ${ctx.env.SESSION_TOKEN ? 'env' : 'storage'}`,
    sound: false,
  });

  const cookie = [
    'ldc-locale=zh',
    `__Host-authjs.csrf-token=${csrfToken}`,
    `__Secure-authjs.callback-url=${callbackUrl}`,
    `__Secure-authjs.session-token=${sessionToken}`,
  ].join('; ');

  // ---- Server Action 常量 ----
  const ACTION_CHECK_STATUS = '00c745e948dc7174bd041a831aaeffe322f5dd68e8';
  const ACTION_CHECKIN = '40cdcb5bce34e42ec0ef1ca0b21886d659a8e0a9c6';
  const ROUTER_TREE_PROFILE =
    '%5B%22%22%2C%7B%22children%22%3A%5B%22profile%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2Cfalse%5D%7D%2Cnull%2Cnull%2Cfalse%5D%7D%2Cnull%2Cnull%2Ctrue%5D';

  const baseHeaders = {
    'Content-Type': 'text/plain;charset=UTF-8',
    'Accept': 'text/x-component',
    'next-router-state-tree': ROUTER_TREE_PROFILE,
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/profile`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  // ---- 解析 RSC 响应中 "1:" 行的 JSON ----
  function parseLine1(text) {
    try {
      const lines = text.split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('1:')) {
          return JSON.parse(t.slice(2));
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // ---- Step 1: 检查签到状态 ----
  try {
    const statusResp = await ctx.http.post(`${BASE_URL}/profile`, {
      headers: { ...baseHeaders, 'next-action': ACTION_CHECK_STATUS },
      body: '[]',
      timeout: 15000,
    });
    const statusText = await statusResp.text();
    const statusData = parseLine1(statusText);

    if (statusData && statusData.checkedIn === true) {
      const msg = '今天已经签到过了 ✅';
      ctx.storage.setJSON('lastCheckin', {
        date: new Date().toISOString().slice(0, 10),
        result: 'already',
        points: 0,
        message: msg,
      });
      ctx.notify({ title: '7li7li 签到', body: msg });
      return;
    }
  } catch (e) {
    ctx.notify({ title: '7li7li 签到失败', body: `检查状态出错: ${e.message}` });
    return;
  }

  // ---- Step 2: 执行签到 (随机模式) ----
  try {
    const checkinResp = await ctx.http.post(`${BASE_URL}/profile`, {
      headers: { ...baseHeaders, 'next-action': ACTION_CHECKIN },
      body: '["random"]',
      timeout: 20000,
    });
    const checkinText = await checkinResp.text();
    const result = parseLine1(checkinText);

    if (result && result.success === true) {
      const points = result.points;
      const days = result.consecutiveDays;
      const msg = `签到成功！获得 ${points} 积分，连续签到 ${days} 天 🎉`;
      ctx.storage.setJSON('lastCheckin', {
        date: new Date().toISOString().slice(0, 10),
        result: 'success',
        mode: result.mode,
        points: points,
        days: days,
        message: msg,
      });
      ctx.notify({ title: '7li7li 签到', body: msg });
    } else if (result && result.error) {
      const msg =
        result.error === 'Not logged in'
          ? 'Cookie 已过期: 请在 iOS Safari 重新登录 store.7li7li.com 即可自动更新'
          : `签到失败: ${result.error}`;
      ctx.storage.setJSON('lastCheckin', {
        date: new Date().toISOString().slice(0, 10),
        result: 'failed',
        error: result.error,
        message: msg,
      });
      // cookie 无效时清除 storage 中的旧值，避免下次继续用坏 cookie
      if (result.error === 'Not logged in') {
        ctx.storage.delete('session_token');
        ctx.storage.delete('csrf_token');
      }
      ctx.notify({
        title: '7li7li 签到失败',
        body: msg,
        action: { type: 'openUrl', url: 'https://store.7li7li.com/' },
      });
    } else {
      const msg = '签到失败: 无法解析响应（可能 Action ID 已过期）';
      ctx.storage.setJSON('lastCheckin', {
        date: new Date().toISOString().slice(0, 10),
        result: 'failed',
        error: 'unparseable',
        message: msg,
      });
      ctx.notify({ title: '7li7li 签到失败', body: msg });
    }
  } catch (e) {
    const msg = `签到请求出错: ${e.message}`;
    ctx.storage.setJSON('lastCheckin', {
      date: new Date().toISOString().slice(0, 10),
      result: 'failed',
      error: e.message,
      message: msg,
    });
    ctx.notify({ title: '7li7li 签到失败', body: msg });
  }
}
