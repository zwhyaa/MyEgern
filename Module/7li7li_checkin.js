/**
 * 7li7li 自动签到与 Cookie 抓取脚本 (Egern 专用 - 严格验证版)
 */

const KEY_COOKIE = '7li7li_store_cookie';
const KEY_TOKEN = '7li7li_store_token';

if (typeof $request !== 'undefined') {
    const headers = $request.headers || {};
    const cookie = headers['Cookie'] || headers['cookie'] || headers['COOKIE'] || '';
    const token = headers['Authorization'] || headers['authorization'] || headers['AUTHORIZATION'] || '';

    let isUpdated = false;

    // 1. 抓取 Authorization 请求头 (现代 API 登录后的标准 Token)
    if (token && token.length > 10 && !token.includes('undefined')) {
        $persistentStore.write(token, KEY_TOKEN);
        isUpdated = true;
    }

    // 2. 抓取 Cookie (严格排除 Cloudflare/Google 等游客 Cookie)
    if (cookie) {
        // 常见的游客/防刷 Cookie 关键字
        const isGuestOnly = cookie.includes('cf_clearance') || cookie.includes('_ga=') || cookie.includes('_gid=');
        // 真正的用户登录凭证标志
        const hasAuthKeyword = cookie.includes('token=') || cookie.includes('auth=') || cookie.includes('session=') || cookie.includes('user=');

        if (hasAuthKeyword && !isGuestOnly) {
            $persistentStore.write(cookie, KEY_COOKIE);
            isUpdated = true;
        }
    }

    if (isUpdated) {
        $notification.post('7li7li 杂货铺', '🔑 真实登录凭证抓取成功', '有效身份凭证已更新！每天 08:30 将自动为你签到。');
    }

    // 保证请求原样放行，不影响网页正常登录与加载
    $done({});
} else {
    // ===== 定时签到逻辑 =====
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
}
