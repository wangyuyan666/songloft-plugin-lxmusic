// 移植自 lxserver src/modules/utils/message.js（补充平台代码引用的 fail/tooManyRequests）。
export const requestMsg = {
  cancelRequest: 'Cancel Request',
  unachievable: 'Socket Hang Up',
  timeout: 'Request Timeout',
  notConnectNetwork: 'Network Error',
  fail: 'Request Failed',
  tooManyRequests: 'Too Many Requests',
};
