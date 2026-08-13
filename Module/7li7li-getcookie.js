// ============================================================
// 7li7li杂货铺 Cookie 自动捕获 (Egern HTTP Request 脚本)
// 由 7li7li-checkin.yaml 模块调用
// ============================================================
// 原理:
//   登录成功后，浏览器访问 store.7li7li.com 的任意请求
//   都会自动携带 Cookie(含 __Secure-authjs.session-token)。
//   本脚本在请求发送前执行，直接从请求头读取 Cookie。
//
// 关键: 捕获后会先用该 cookie 验证登录状态(请求 profile 页面)，
//       验证通过才写入 storage。防止捕获到登录流程早期的
//       旧/无效 cookie 而覆盖有效值。
//
// 诊断: 每次触发都会写 storage 的 gc_debug
// ============================================================

export default async function(ctx) {
  const url = (ctx.request && ctx.request.url) || '';

  // 只处理 7li7li 域名的请求
  if (!url.includes('store.7li7li.com')) {
    return; // 透传
  }

  // 防递归: 验证用的 profile 请求也会匹配本脚本
  if (ctx.storage.get('gc_verifying') === '1') {
    return;
  }

  // 从请求头读取 Cookie
  let cookieHeader = '';
  try {
    cookieHeader = ctx.request.headers.get('Cookie') || '';
  } catch (e) {
    return;
  }

  // 解析 Cookie
  const cookies = {};
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }

  const sessionToken = cookies['__Secure-authjs.session-token'];
  if (!sessionToken) {
    return; // 无 session-token，忽略
  }

  // 与已保存的相同则跳过
  if (ctx.storage.get('session_token') === sessionToken) {
    return;
  }

  // 用捕获的 cookie 构造完整 Cookie 头用于验证
  const csrfToken = cookies['__Host-authjs.csrf-token'] || '';
  const callbackUrl =
    cookies['__Secure-authjs.callback-url'] ||
    'https%3A%2F%2Fstore.7li7li.com%2F';
  const fullCookie = [
    'ldc-locale=zh',
    `__Host-authjs.csrf-token=${csrfToken}`,
    `__Secure-authjs.callback-url=${callbackUrl}`,
    `__Secure-authjs.session-token=${sessionToken}`,
  ].join('; ');

  // 验证: 请求 profile RSC 页面，检查是否返回用户数据
  ctx.storage.set('gc_verifying', '1');
  let valid = false;
  try {
    const resp = await ctx.http.get(
      'https://store.7li7li.com/profile?_rsc=17tce',
      {
        headers: {
          'Accept': '*/*',
          'rsc': '1',
          'Cookie': fullCookie,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 10000,
      }
    );
    const text = await resp.text();
    // 登录有效时 RSC 响应包含用户数据 (points/name 等)
    valid = text.includes('"points"') || text.includes('"name"');
  } catch (e) {
    valid = false;
  } finally {
    ctx.storage.set('gc_verifying', '');
  }

  if (valid) {
    // 验证通过，写入 storage
    ctx.storage.set('session_token', sessionToken);
    if (csrfToken) {
      ctx.storage.set('csrf_token', csrfToken);
    }
    ctx.storage.set('callback_url', callbackUrl);
    ctx.storage.setJSON('gc_debug', {
      lastTriggerTime: new Date().toISOString(),
      lastUrl: url,
      captured: true,
      validated: true,
    });
    ctx.notify({
      title: '7li7li Cookie 已更新',
      body: '已验证有效，签到脚本将自动使用新 cookie',
      sound: true,
    });
  } else {
    // 无效，不覆盖
    ctx.storage.setJSON('gc_debug', {
      lastTriggerTime: new Date().toISOString(),
      lastUrl: url,
      captured: true,
      validated: false,
      reason: 'cookie 无效或未登录',
    });
  }

  return; // 透传请求
}
