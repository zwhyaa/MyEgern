// ============================================================
// 7li7li杂货铺 Cookie 自动捕获 (Egern Response 脚本)
// 由 7li7li-checkin.yaml 模块调用
// ============================================================
// 用途: iOS Safari 打开并登录 store.7li7li.com 时，
//       自动从 Set-Cookie 提取 session-token 存入 storage，
//       供签到脚本使用，实现"登录一次自动保活"。
// ============================================================

export default async function(ctx) {
  const url = (ctx.request && ctx.request.url) || '';

  // 只处理 7li7li 域名的响应
  if (!url.includes('store.7li7li.com')) {
    return; // 透传
  }

  // 从响应头提取 Set-Cookie
  let setCookies = [];
  try {
    setCookies = ctx.response.headers.getAll('set-cookie') || [];
  } catch (e) {
    return;
  }
  if (setCookies.length === 0) {
    return; // 无 cookie 变化
  }

  // 解析所有 cookie
  const cookies = {};
  for (const sc of setCookies) {
    // 格式: name=value; Path=/; HttpOnly; Secure; SameSite=Lax
    const firstPair = sc.split(';')[0];
    const eq = firstPair.indexOf('=');
    if (eq === -1) continue;
    const name = firstPair.slice(0, eq).trim();
    const value = firstPair.slice(eq + 1).trim();
    cookies[name] = value;
  }

  // 提取需要的 cookie
  const sessionToken = cookies['__Secure-authjs.session-token'];
  const csrfToken = cookies['__Host-authjs.csrf-token'];

  let saved = [];
  if (sessionToken) {
    ctx.storage.set('session_token', sessionToken);
    saved.push('session_token');
  }
  if (csrfToken) {
    ctx.storage.set('csrf_token', csrfToken);
    saved.push('csrf_token');
  }

  // 固定值
  ctx.storage.set('callback_url', 'https%3A%2F%2Fstore.7li7li.com%2F');

  if (saved.length > 0) {
    ctx.notify({
      title: '7li7li Cookie 已更新',
      body: `已捕获: ${saved.join(', ')}\n签到脚本将自动使用新 cookie`,
      sound: true,
    });
  }

  return; // 透传响应
}
