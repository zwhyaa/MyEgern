const KEY_COOKIE = '7li7li_store_cookie';

// ===== 【阶段 1：静默抓取/更新 Cookie 凭证】 =====
if (typeof $request !== 'undefined') {
    try {
        const headers = $request.headers || {};
        const cookie = headers['Cookie'] || headers['cookie'] || headers['COOKIE'] || '';

        // 只有包含真正登录凭证 __Secure-authjs.session-token 时才写入
        if (cookie && cookie.includes('__Secure-authjs.session-token')) {
            const oldCookie = $persistentStore.read(KEY_COOKIE);
            if (oldCookie !== cookie) {
                $persistentStore.write(cookie, KEY_COOKIE);
                $notification.post('7li7li 杂货铺', '🔑 凭证抓取成功', '已精准提取 Session Token！每天 08:30 将自动为您完成签到。');
            }
        }
    } catch (e) {
        console.log("Cookie 抓取异常: " + e);
    } finally {
        $done({});
    }
} 
// ===== 【阶段 2：定时自动签到 (模拟终端 cURL 逻辑)】 =====
else if (typeof $request === 'undefined' && typeof $response === 'undefined') {
    const cookie = $persistentStore.read(KEY_COOKIE);

    if (!cookie) {
        $notification.post('7li7li 杂货铺', '❌ 签到失败', '未找到有效 Session 凭证，请用 Safari 打开 store.7li7li.com/profile 登录并刷新。');
        $done();
    } else {
        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Origin': 'https://store.7li7li.com',
            'Referer': 'https://store.7li7li.com/profile',
            'Content-Type': 'text/plain;charset=UTF-8',
            'next-router-state-tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22profile%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2Cfalse%5D%7D%2Cnull%2Cnull%2Cfalse%5D%7D%2Cnull%2Cnull%2Ctrue%5D',
            'Cookie': cookie
        };

        $httpClient.post({
            url: 'https://store.7li7li.com/profile',
            headers: reqHeaders,
            body: '{}'
        }, function(error, response, data) {
            if (error) {
                $notification.post('7li7li 杂货铺', '❌ 签到请求失败', error.toString());
            } else {
                if (response.status === 200) {
                    if (data && (data.includes('"success":true') || data.includes('success'))) {
                        $notification.post('7li7li 杂货铺', '🎉 签到成功', '已成功发送签到/刷新指令！返回: success: true');
                    } else {
                        $notification.post('7li7li 杂货铺', 'ℹ️ 响应成功', '状态码 200，已成功触发个人中心状态更新。');
                    }
                } else if (response.status === 401 || response.status === 403) {
                    $notification.post('7li7li 杂货铺', '⚠️ 凭证失效', 'Session 已过期，请重新打开网页登录获取新凭证。');
                } else {
                    $notification.post('7li7li 杂货铺', '⚠️ 响应状态', `状态码: ${response.status}`);
                }
            }
            $done();
        });
    }
} else {
    $done({});
}
