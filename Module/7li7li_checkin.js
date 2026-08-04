/**
 * 7li7li 自动签到与 Cookie 抓取脚本 (适配 Linux Do OAuth 登录)
 * 版本 2.0
 */

const KEY_COOKIE = '7li7li_store_cookie';
const KEY_TOKEN = '7li7li_store_token';

// ===== 【阶段 1：响应捕获 — 从请求头或响应头提取凭证】 =====
if (typeof $response !== 'undefined') {
  try {
    const url = $request.url || '';
    const status = $response.status;
    const body = $response.body || '';

    // 只处理 store.7li7li.com 的 API 响应（防止命中其他域名）
    if (!url.startsWith('https://store.7li7li.com/api/')) {
      $done();
      return;
    }

    // 跳过非 200 响应
    if (status !== 200) {
      $done();
      return;
    }

    // 解析响应体，检查是否表示“已登录”成功状态
    let isValidAuth = false;
    let jsonBody = null;
    try {
      jsonBody = JSON.parse(body);
      if (jsonBody.code === 200 || jsonBody.success === true || jsonBody.status === 1) {
        isValidAuth = true;
      }
    } catch (e) {
      // 如果响应体不是 JSON，但排除明显不是登录相关的内容
      if (body.includes('未登录') || body.includes('跳转') || body.length < 20) {
        $done();
        return;
      }
      // 否则假定是有效页面（如 HTML 回调），但通常不从这里提取凭证
    }

    // 如果 JSON 解析成功且状态正确，则尝试提取凭证
    if (isValidAuth) {
      let updated = false;

      // 1. 从响应头中提取 Set-Cookie（最直接的下发方式）
      const setCookie = $response.headers['Set-Cookie'] || $response.headers['set-cookie'] || '';
      if (setCookie) {
        // 只提取包含关键会话信息的 cookie
        if (setCookie.includes('token=') || setCookie.includes('auth=') || setCookie.includes('session=') || setCookie.includes('user=')) {
          $persistentStore.write(setCookie, KEY_COOKIE);
          updated = true;
        } else {
          // 如果没有明确的 session 标识，但整个 Set-Cookie 不为空，则可能包含其他重要 cookie，存储起来
          $persistentStore.write(setCookie, KEY_COOKIE);
          updated = true;
        }
      }

      // 2. 从请求头中提取现有的 Cookie（当请求头携带时）
      const reqHeaders = $request.headers || {};
      const cookieHeader = reqHeaders['Cookie'] || reqHeaders['cookie'] || reqHeaders['COOKIE'] || '';
      if (cookieHeader && (cookieHeader.includes('token=') || cookieHeader.includes('auth=') || cookieHeader.includes('session=') || cookieHeader.includes('user='))) {
        $persistentStore.write(cookieHeader, KEY_COOKIE);
        updated = true;
      }

      // 3. 提取 Authorization Token（Bearer/JWT）
      const authHeader = reqHeaders['Authorization'] || reqHeaders['authorization'] || reqHeaders['AUTHORIZATION'] || '';
      if (authHeader && authHeader.length > 15) {
        $persistentStore.write(authHeader, KEY_TOKEN);
        updated = true;
      }

      // 4. 如果响应体 JSON 中直接包含 token 字段，也将其提取（有些接口返回 token 而非 header）
      if (jsonBody && jsonBody.token && jsonBody.token.length > 10) {
        $persistentStore.write(jsonBody.token, KEY_TOKEN);
        updated = true;
      }

      if (updated) {
        $notification.post('7li7li 杂货铺', '🔑 提取到有效凭证', 'Linux Do 授权验证通过！每天 08:30 将自动为您签到。');
      }
    }
  } catch (e) {
    console.log("Cookie 抓取脚本执行错误: " + e);
  } finally {
    $done(); // 不要传递空对象，避免修改响应
  }
}
// ===== 【阶段 2：定时签到任务】 =====
else if (typeof $request === 'undefined' && typeof $response === 'undefined') {
  const cookie = $persistentStore.read(KEY_COOKIE);
  const token = $persistentStore.read(KEY_TOKEN);

  if (!cookie && !token) {
    $notification.post('7li7li 杂货铺', '❌ 签到失败', '未找到有效登录凭证，请先登录 store.7li7li.com 账号。');
    $done();
  } else {
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Referer': 'https://store.7li7li.com/',
      'Accept': 'application/json, text/plain, */*'
    };

    if (cookie) reqHeaders['Cookie'] = cookie;
    if (token) reqHeaders['Authorization'] = token;

    $httpClient.post({
      url: 'https://store.7li7li.com/api/user/checkin',
      headers: reqHeaders
    }, function(error, response, data) {
      if (error) {
        $notification.post('7li7li 杂货铺', '❌ 签到请求失败', error.toString());
      } else {
        try {
          const res = JSON.parse(data);
          const msg = res.message || res.msg || res.detail || data;
          if (res.code === 200 || res.success || res.status === 1) {
            $notification.post('7li7li 杂货铺', '🎉 签到成功', msg);
          } else if (data.includes('已签到') || data.includes('repeat') || data.includes('already')) {
            $notification.post('7li7li 杂货铺', 'ℹ️ 今日已签到', msg);
          } else {
            $notification.post('7li7li 杂货铺', '🔔 签到响应结果', msg);
          }
        } catch (e) {
          $notification.post('7li7li 杂货铺', '🔔 签到响应', data);
        }
      }
      $done();
    });
  }
} else {
  $done();
}
