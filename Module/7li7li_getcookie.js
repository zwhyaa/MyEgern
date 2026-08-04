// 7li7li_getcookie.js
const KEY_COOKIE = '7li7li_store_cookie';
const KEY_TOKEN = '7li7li_store_token';

if (typeof $response !== 'undefined') {
  try {
    const url = $request.url || '';
    const status = $response.status;
    const body = $response.body || '';
    const reqHeaders = $request.headers || {};

    if (status !== 200) { $done(); return; }

    let jsonBody = null;
    try {
      jsonBody = JSON.parse(body);
    } catch (e) {
      $done(); return;
    }

    // 严格判断是否是真正的登录成功响应
    const hasToken = jsonBody && (
      jsonBody.token ||
      jsonBody.access_token ||
      jsonBody.refresh_token ||
      jsonBody.data?.token
    );
    const hasUserInfo = jsonBody && (
      (jsonBody.data && (jsonBody.data.username || jsonBody.data.user_id || jsonBody.data.nickname || jsonBody.data.avatar)) ||
      jsonBody.username ||
      jsonBody.user_id ||
      jsonBody.nickname ||
      jsonBody.avatar ||
      jsonBody.email
    );
    const setCookie = $response.headers['Set-Cookie'] || $response.headers['set-cookie'] || '';
    const hasAuthCookie = /(token|auth|session|sid|uid)=([^;]+)/i.test(setCookie);

    if (!hasToken && !hasUserInfo && !hasAuthCookie) {
      $done(); return;
    }

    let updated = false;

    if (hasAuthCookie) {
      $persistentStore.write(setCookie, KEY_COOKIE);
      updated = true;
    }

    const cookieHeader = reqHeaders['Cookie'] || reqHeaders['cookie'] || '';
    if (cookieHeader && /(token|auth|session|sid|uid)=([^;]+)/i.test(cookieHeader)) {
      if (!updated) {
        $persistentStore.write(cookieHeader, KEY_COOKIE);
        updated = true;
      }
    }

    const authHeader = reqHeaders['Authorization'] || reqHeaders['authorization'] || '';
    if (authHeader && authHeader.startsWith('Bearer ') && authHeader.length > 20) {
      $persistentStore.write(authHeader, KEY_TOKEN);
      updated = true;
    }

    if (hasToken) {
      const theToken = jsonBody.token || jsonBody.access_token || jsonBody.data?.token || '';
      if (theToken.length > 10) {
        $persistentStore.write(theToken, KEY_TOKEN);
        updated = true;
      }
    }

    if (updated) {
      const oldCookie = $persistentStore.read(KEY_COOKIE);
      const oldToken = $persistentStore.read(KEY_TOKEN);
      if (!oldCookie && !oldToken) {
        $notification.post('7li7li 杂货铺', '🔑 登录凭证已捕获', 'Linux Do 授权成功！每天 08:30 自动签到。');
      }
    }
  } catch (e) {
    console.log('提取脚本异常: ' + e);
  } finally {
    $done();
  }
} else {
  $done();
}
