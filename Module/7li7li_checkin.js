```javascript:7li7li_checkin.js
/**
 * 7li7li 自动签到与 Cookie 抓取脚本 (终极响应验证版)
 */

const KEY_COOKIE = '7li7li_store_cookie';
const KEY_TOKEN = '7li7li_store_token';

// ===== 【阶段 1：响应验证抓取 (绝对确保凭证有效)】 =====
if (typeof $response !== 'undefined') {
    try {
        const status = $response.status;
        const body = $response.body || '';
        const url = $request.url || '';

        // 排除 login/register 等过渡接口，只在请求具体的“用户数据”时验证
        if (url.includes('/user') || url.includes('/checkin') || url.includes('/profile') || url.includes('/mine') || url.includes('/info')) {
            let isValidAuth = false;

            // 1. 验证服务器是否真正认可了这次请求（返回 HTTP 200）
            if (status === 200) {
                try {
                    const resJson = JSON.parse(body);
                    // 2. 确认返回的 JSON 确实是成功获取到了数据，而不是“未登录”的报错
                    if (resJson.code === 200 || resJson.success === true || resJson.status === 1 || resJson.data) {
                        isValidAuth = true;
                    }
                } catch (e) {
                    // 如果不是 JSON，只要没提示未登录，也视为成功
                    if (!body.includes('未登录') && !body.includes('请登录')) {
                        isValidAuth = true;
                    }
                }
            }

            // 3. 只有服务器验证通过，才去提取真正产生作用的 Token
            if (isValidAuth) {
                const headers = $request.headers || {};
                const cookie = headers['Cookie'] || headers['cookie'] || headers['COOKIE'] || '';
                const token = headers['Authorization'] || headers['authorization'] || headers['AUTHORIZATION'] || '';

                let isUpdated = false;

                if (token && token.length > 15 && token !== 'undefined') {
                    $persistentStore.write(token, KEY_TOKEN);
                    isUpdated = true;
                }

                if (cookie && (cookie.includes('token=') || cookie.includes('auth=') || cookie.includes('session=') || cookie.includes('user='))) {
                    $persistentStore.write(cookie, KEY_COOKIE);
                    isUpdated = true;
                }

                if (isUpdated) {
                    $notification.post('7li7li 杂货铺', '🔑 提取到有效凭证', '服务器已验证您的登录状态！每天 08:30 将自动为您签到。');
                }
            }
        }
    } catch (e) {
        console.log("Cookie 抓取脚本执行错误: " + e);
    } finally {
        $done({}); // 确保绝对不会卡死网页加载
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
    // 兼容其他意外拦截，直接放行
    $done({});
}
