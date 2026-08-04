// 7li7li_checkin.js
const KEY_COOKIE = '7li7li_store_cookie';
const KEY_TOKEN = '7li7li_store_token';

const cookie = $persistentStore.read(KEY_COOKIE);
const token = $persistentStore.read(KEY_TOKEN);

if (!cookie && !token) {
  $notification.post('7li7li 杂货铺', '❌ 签到失败', '未找到有效凭证，请先登录 store.7li7li.com。');
  $done();
  return;
}

const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Referer': 'https://store.7li7li.com/',
  'Accept': 'application/json, text/plain, */*'
};
if (cookie) headers['Cookie'] = cookie;
if (token) headers['Authorization'] = token;

$httpClient.post({
  url: 'https://store.7li7li.com/api/user/checkin',
  headers: headers
}, function(error, response, data) {
  if (error) {
    $notification.post('7li7li 杂货铺', '❌ 签到请求失败', error.toString());
  } else {
    try {
      const res = JSON.parse(data);
      const msg = res.message || res.msg || res.detail || data;
      if (res.code === 200 || res.success || res.status === 1 || data.includes('签到成功') || data.includes('获得积分')) {
        $notification.post('7li7li 杂货铺', '🎉 签到成功', msg);
      } else if (data.includes('已签到') || data.includes('repeat') || data.includes('already')) {
        $notification.post('7li7li 杂货铺', 'ℹ️ 今日已签到', msg);
      } else {
        $notification.post('7li7li 杂货铺', '🔔 签到响应', msg);
      }
    } catch (e) {
      $notification.post('7li7li 杂货铺', '🔔 签到响应', data);
    }
  }
  $done();
});
