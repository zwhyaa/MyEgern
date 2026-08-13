// ============================================================
// 7li7li杂货铺 Cookie 捕获 + 自动签到 (Egern HTTP Request 脚本)
// 由 7li7li-checkin.yaml 模块调用
// ============================================================
// 原理:
//   用户在 iOS Safari 打开/刷新 store.7li7li.com 时，本脚本
//   在请求发送前执行，从请求头读取 Cookie(含 session-token)。
//   捕获后立即用该 cookie 验证登录态并【直接执行签到】，
//   无需跨脚本共享 storage，登录一次即完成当天签到。
//
// 注意: 本脚本会在每次访问 store.7li7li.com 时触发，
//       已签到则跳过，不会重复签到。
// ============================================================

export default async function(ctx) {
  const url = (ctx.request && ctx.request.url) || '';
  const BASE_URL = 'https://store.7li7li.com';

  // 只处理 7li7li 域名的请求
  if (!url.includes('store.7li7li.com')) {
    return;
  }

  // 防递归: 本脚本内部发起的验证/签到请求也会匹配此域名
  if (ctx.storage.get('gc_busy') === '1') {
    return;
  }

  // ---- 读取请求头 Cookie ----
  let cookieHeader = '';
  try {
    cookieHeader = ctx.request.headers.get('Cookie') || '';
  } catch (e) {
    return;
  }
  if (!cookieHeader) return;

  // ---- 解析 Cookie ----
  const cookies = {};
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }

  const sessionToken = cookies['__Secure-authjs.session-token'];
  const csrfToken = cookies['__Host-authjs.csrf-token'] || '';
  if (!sessionToken) return;

  const callbackUrl =
    cookies['__Secure-authjs.callback-url'] ||
    'https%3A%2F%2Fstore.7li7li.com%2F';

  const fullCookie = [
    'ldc-locale=zh',
    `__Host-authjs.csrf-token=${csrfToken}`,
    `__Secure-authjs.callback-url=${callbackUrl}`,
    `__Secure-authjs.session-token=${sessionToken}`,
  ].join('; ');

  // ---- 记录捕获信息（供其他脚本/调试） ----
  ctx.storage.set('session_token', sessionToken);
  if (csrfToken) ctx.storage.set('csrf_token', csrfToken);
  ctx.storage.set('callback_url', callbackUrl);

  // ---- 防止递归执行: 标记忙碌 ----
  ctx.storage.set('gc_busy', '1');

  try {
    // ---- 验证登录态: 请求 profile RSC 页面 ----
    let valid = false;
    try {
      const resp = await ctx.http.get(`${BASE_URL}/profile?_rsc=17tce`, {
        headers: {
          'Accept': '*/*',
          'rsc': '1',
          'Cookie': fullCookie,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 10000,
      });
      const text = await resp.text();
      valid = text.includes('"points"') || text.includes('"name"');
    } catch (e) {
      valid = false;
    }

    if (!valid) {
      ctx.storage.setJSON('gc_debug', {
        lastTriggerTime: new Date().toISOString(),
        captured: true,
        validated: false,
        reason: 'cookie 无效或未登录',
      });
      return;
    }

    // ---- 检查签到状态 ----
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
      'Cookie': fullCookie,
    };

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

    // 查状态
    let checkedIn = false;
    try {
      const statusResp = await ctx.http.post(`${BASE_URL}/profile`, {
        headers: { ...baseHeaders, 'next-action': ACTION_CHECK_STATUS },
        body: '[]',
        timeout: 15000,
      });
      const statusData = parseLine1(await statusResp.text());
      checkedIn = !!(statusData && statusData.checkedIn === true);
    } catch (e) {
      // 状态查询失败则跳过签到
      ctx.storage.setJSON('gc_debug', {
        lastTriggerTime: new Date().toISOString(),
        captured: true,
        validated: true,
        statusCheckError: e.message,
      });
      return;
    }

    if (checkedIn) {
      ctx.storage.setJSON('gc_debug', {
        lastTriggerTime: new Date().toISOString(),
        captured: true,
        validated: true,
        checkedIn: true,
      });
      return; // 已签到，静默跳过
    }

    // 执行签到 (随机模式)
    try {
      const checkinResp = await ctx.http.post(`${BASE_URL}/profile`, {
        headers: { ...baseHeaders, 'next-action': ACTION_CHECKIN },
        body: '["random"]',
        timeout: 20000,
      });
      const result = parseLine1(await checkinResp.text());

      if (result && result.success === true) {
        const msg = `签到成功！获得 ${result.points} 积分，连续签到 ${result.consecutiveDays} 天 🎉`;
        ctx.storage.setJSON('lastCheckin', {
          date: new Date().toISOString().slice(0, 10),
          result: 'success',
          mode: result.mode,
          points: result.points,
          days: result.consecutiveDays,
          message: msg,
        });
        ctx.notify({ title: '7li7li 签到', body: msg, sound: true });
      } else if (result && result.error) {
        const msg = `签到失败: ${result.error}`;
        ctx.storage.setJSON('lastCheckin', {
          date: new Date().toISOString().slice(0, 10),
          result: 'failed',
          error: result.error,
          message: msg,
        });
        ctx.notify({ title: '7li7li 签到失败', body: msg, sound: true });
      }
    } catch (e) {
      const msg = `签到请求出错: ${e.message}`;
      ctx.storage.setJSON('lastCheckin', {
        date: new Date().toISOString().slice(0, 10),
        result: 'failed',
        error: e.message,
        message: msg,
      });
      ctx.notify({ title: '7li7li 签到失败', body: msg, sound: true });
    }
  } finally {
    ctx.storage.set('gc_busy', '');
  }

  return; // 透传请求
}
