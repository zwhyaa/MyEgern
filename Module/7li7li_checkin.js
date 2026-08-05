const KEY_COOKIE = '7li7li_store_cookie';
const KEY_ACTION = '7li7li_next_action';

// ===== 【阶段 1：静默抓取 Cookie & next-action】 =====
if (typeof $request !== 'undefined') {
    try {
        const url = $request.url || '';
        const method = $request.method || 'GET';
        const headers = $request.headers || {};
        const cookie = headers['Cookie'] || headers['cookie'] || headers['COOKIE'] || '';

        // 保存包含登录凭证的 Cookie
        if (cookie && cookie.includes('__Secure-authjs.session-token')) {
            const oldCookie = $persistentStore.read(KEY_COOKIE);
            if (oldCookie !== cookie) {
                $persistentStore.write(cookie, KEY_COOKIE);
                $notification.post('7li7li 杂货铺', '🔑 凭证抓取成功', 'Session 已更新');
            }
        }

        // 捕获 POST /profile 时的 next-action（首次手动签到时会触发）
        if (method === 'POST' && url.includes('/profile') && headers['next-action']) {
            const action = headers['next-action'];
            const oldAction = $persistentStore.read(KEY_ACTION);
            if (oldAction !== action) {
                $persistentStore.write(action, KEY_ACTION);
                console.log('捕获到新的 next-action: ' + action);
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

    if (!cookie) {
        $notification.post('7li7li 杂货铺', '❌ 签到失败', '未找到 Session Cookie，请用 Safari 登录 store.7li7li.com');
        $done();
    } else if (!action) {
        $notification.post('7li7li 杂货铺', '❌ 签到失败', '未捕获到签到动作，请手动进入 Profile 页面并点击签到一次（脚本会自动记录）。');
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
                $done();
                return;
            }

            console.log("签到原始响应:\n" + data);

            // ---------- 解析 Flight 响应（第二行通常是 action 结果） ----------
            let actionResult = null;
            if (data) {
                const lines = data.split('\n');
                for (let line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(trimmed);
                            if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                                actionResult = parsed;
                                break;
                            }
                        } catch (e) { /* 忽略非 JSON 行 */ }
                    }
                }
            }

            // ---------- 提取积分信息（灵活匹配常见字段） ----------
            let gainedPoints = null;   // 本次获得积分
            let currentPoints = null;  // 当前总积分

            // 优先从 actionResult 中提取
            if (actionResult) {
                // 可能表示“获得积分”的字段（英文/中文）
                const gainFields = ['reward', 'gained', 'earned', 'addPoints', 'increment', 'gain', 'obtain', '获得', '增加'];
                for (let key of gainFields) {
                    if (actionResult[key] !== undefined) {
                        gainedPoints = actionResult[key];
                        break;
                    }
                }
                // 可能表示“当前积分”的字段
                const currentFields = ['points', 'credit', 'credits', 'integral', 'score', 'balance', 'coins', 'point', '剩余', '当前积分'];
                for (let key of currentFields) {
                    if (actionResult[key] !== undefined) {
                        currentPoints = actionResult[key];
                        break;
                    }
                }
            }

            // 如果 actionResult 未提取到，再从整个 data 中正则匹配一次（备用）
            if (!gainedPoints && !currentPoints && data) {
                // 匹配 "reward": 123 或 "gained": 123 或 "获得": 123
                const gainMatch = data.match(/"(?:reward|gained|earned|addPoints|increment)":\s*(\d+(?:\.\d+)?)/i)
                               || data.match(/(?:获得|增加)[：:]\s*(\d+(?:\.\d+)?)/);
                if (gainMatch) gainedPoints = gainMatch[1];

                // 匹配当前总积分
                const currentMatch = data.match(/"(?:points|credit|credits|integral|score|balance|coins)":\s*(\d+(?:\.\d+)?)/i)
                                  || data.match(/(?:剩余|当前积分)[：:]\s*(\d+(?:\.\d+)?)/);
                if (currentMatch) currentPoints = currentMatch[1];
            }

            // ---------- 根据 actionResult 判断签到状态 ----------
            let notificationTitle = '';
            let notificationBody = '';

            if (actionResult) {
                if (actionResult.success === true) {
                    // 签到成功
                    notificationTitle = '🎉 签到成功';
                    let parts = [];
                    if (gainedPoints !== null) parts.push(`获得 ${gainedPoints} 积分`);
                    if (currentPoints !== null) parts.push(`当前 ${currentPoints} 积分`);
                    notificationBody = parts.length ? parts.join('，') : '积分信息未知';
                } else if (actionResult.success === false) {
                    const errorMsg = (actionResult.error || '').toLowerCase();
                    // 判断是否已签到（常见提示：already signed, 已签到, 重复签到等）
                    const alreadyPatterns = ['already', 'signed', 'checked', '重复', '已签到', '今日已签'];
                    const isAlreadySigned = alreadyPatterns.some(p => errorMsg.includes(p));

                    if (isAlreadySigned) {
                        notificationTitle = 'ℹ️ 今日已签到';
                        notificationBody = currentPoints !== null ? `当前 ${currentPoints} 积分` : '无积分信息';
                    } else if (errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
                        notificationTitle = '⚠️ 凭证失效';
                        notificationBody = 'Session 或 Action 已过期，请重新登录并手动签到一次';
                    } else {
                        notificationTitle = '❌ 签到失败';
                        notificationBody = `服务器返回: ${actionResult.error || '未知错误'}`;
                    }
                } else {
                    // success 字段不是布尔值，按未知处理
                    notificationTitle = 'ℹ️ 签到响应';
                    notificationBody = '服务器返回了未知格式';
                }
            } else {
                // 无法解析 actionResult，但状态码可能是 200
                if (response.status === 200) {
                    notificationTitle = 'ℹ️ 请求成功';
                    notificationBody = '但未能解析签到结果';
                    if (currentPoints !== null) notificationBody += `，当前积分 ${currentPoints}`;
                } else if (response.status === 401 || response.status === 403) {
                    notificationTitle = '⚠️ 凭证过期';
                    notificationBody = '请重新登录';
                } else {
                    notificationTitle = '⚠️ 异常状态';
                    notificationBody = `状态码 ${response.status}`;
                }
            }

            $notification.post('7li7li 杂货铺', notificationTitle, notificationBody);
            $done();
        });
    }
} else {
    $done({});
}
