const KEY_COOKIE = '7li7li_store_cookie';
const KEY_ACTION = '7li7li_next_action';

// ===== 【阶段 1：静默抓取凭证 & 捕获 next-action】 =====
if (typeof $request !== 'undefined') {
    try {
        const url = $request.url || '';
        const method = $request.method || 'GET';
        const headers = $request.headers || {};
        const cookie = headers['Cookie'] || headers['cookie'] || headers['COOKIE'] || '';

        // 1️⃣ 保存 Cookie（包含 __Secure-authjs.session-token）
        if (cookie && cookie.includes('__Secure-authjs.session-token')) {
            const oldCookie = $persistentStore.read(KEY_COOKIE);
            if (oldCookie !== cookie) {
                $persistentStore.write(cookie, KEY_COOKIE);
                $notification.post('7li7li 杂货铺', '🔑 凭证抓取成功',
                    'Session 已更新');
            }
        }

        // 2️⃣ 捕获 next-action（仅当 POST 到 /profile 且带有 next-action 头）
        if (method === 'POST' && url.includes('/profile') && headers['next-action']) {
            const action = headers['next-action'];
            const oldAction = $persistentStore.read(KEY_ACTION);
            if (oldAction !== action) {
                $persistentStore.write(action, KEY_ACTION);
                console.log('捕获到新 next-action: ' + action);
                // 静默保存，不通知避免打扰
            }
        }
    } catch (e) {
        console.log("拦截异常: " + e);
    } finally {
        $done({});
    }
}
// ===== 【阶段 2：定时自动签到】 =====
else if (typeof $request === 'undefined' && typeof $response === 'undefined') {
    const cookie = $persistentStore.read(KEY_COOKIE);
    const action = $persistentStore.read(KEY_ACTION);

    // 检查必要凭证
    if (!cookie) {
        $notification.post('7li7li 杂货铺', '❌ 签到失败',
            '未找到 Session Cookie，请用 Safari 打开 store.7li7li.com 登录。');
        $done();
    } else if (!action) {
        $notification.post('7li7li 杂货铺', '❌ 签到失败',
            '未捕获到签到动作，请手动进入 Profile 页面并点击签到一次（脚本会自动记录）。');
        $done();
    } else {
        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Origin': 'https://store.7li7li.com',
            'Referer': 'https://store.7li7li.com/profile',
            'Content-Type': 'text/plain;charset=UTF-8',
            'next-action': action,
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
                console.log("原始响应:\n" + data);

                // 解析 Flight 响应，提取 Server Action 结果（第二行）
                let actionResult = null;
                if (data) {
                    const lines = data.split('\n');
                    for (let line of lines) {
                        line = line.trim();
                        if (line.startsWith('{')) {
                            try {
                                const parsed = JSON.parse(line);
                                if (parsed.hasOwnProperty('success')) {
                                    actionResult = parsed;
                                    break;
                                }
                            } catch (e) { /* 不是 JSON 行，继续 */ }
                        }
                    }
                }

                // 提取积分信息（从 actionResult 或整个字符串中）
                let pointsMsg = '';
                if (actionResult) {
                    // 尝试从 actionResult 中找积分字段
                    const pointFields = ['points', 'credit', 'credits', 'integral', 'score', 'balance', 'userCoins', 'coin', 'coins', 'points', 'point', 'remainingPoints'];
                    for (let key of pointFields) {
                        if (actionResult[key] !== undefined) {
                            pointsMsg = `💰 当前 ${key}: ${actionResult[key]}`;
                            break;
                        }
                    }
                    // 若未找到，再尝试从完整字符串正则匹配（flight 其他行可能含积分）
                    if (!pointsMsg) {
                        const match = data.match(/"(?:points|credit|credits|integral|score|balance|userCoins|coin|coins)":\s*(\d+(?:\.\d+)?)/i);
                        if (match) pointsMsg = `💰 积分/余额: ${match[1]}`;
                    }
                } else {
                    // 非 Flight 格式，直接正则
                    const match = data.match(/"(?:points|credit|credits|integral|score|balance|userCoins|coin|coins)":\s*(\d+(?:\.\d+)?)/i);
                    if (match) pointsMsg = `💰 积分/余额: ${match[1]}`;
                }

                // 判断签到结果
                if (response.status === 200) {
                    if (actionResult && actionResult.success === true) {
                        $notification.post('7li7li 杂货铺', '🎉 签到成功',
                            '已成功签到！' + (pointsMsg ? '\n' + pointsMsg : ''));
                    } else if (actionResult && actionResult.success === false) {
                        // 明确失败：可能是凭证过期、已签到、动作失效等
                        let errMsg = actionResult.error || '未知错误';
                        if (errMsg === 'Unauthorized') {
                            $notification.post('7li7li 杂货铺', '⚠️ 凭证失效',
                                'Session 或 Action 已过期，请重新登录并手动签到一次。');
                        } else {
                            $notification.post('7li7li 杂货铺', '❌ 签到失败',
                                `服务器返回: ${errMsg}`);
                        }
                    } else {
                        // 无法明确判断，但状态码 200
                        $notification.post('7li7li 杂货铺', 'ℹ️ 签到触发',
                            '状态码 200，但无明确成功标志。' + (pointsMsg ? '\n' + pointsMsg : ''));
                    }
                } else if (response.status === 401 || response.status === 403) {
                    $notification.post('7li7li 杂货铺', '⚠️ 凭证过期',
                        '请重新打开网页登录以更新 Cookie。');
                } else {
                    $notification.post('7li7li 杂货铺', '⚠️ 响应状态',
                        `状态码: ${response.status}` + (pointsMsg ? '\n' + pointsMsg : ''));
                }
            }
            $done();
        });
    }
} else {
    $done({});
}
