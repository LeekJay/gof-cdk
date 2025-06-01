/**
 * 通用输入对象接口
 * @interface
 */
export interface InputObject {
  [key: string]: string | number | object;
}

/**
 * API 响应通用接口
 * @interface
 * @template T 响应数据类型
 */
export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
  err_code: number;
}

/**
 * 玩家信息接口
 * @interface
 */
export interface PlayerInfo {
  fid: number;
  nickname: string;
  kid: number;
  stove_lv: number;
  stove_lv_content: string;
  avatar_image: string;
  total_recharge_amount: number;
}

/**
 * 验证码接口
 * @interface
 */
export interface Captcha {
  img: string;
}

/**
 * 礼包码处理结果接口
 * @interface
 */
export interface GiftCodeResult {
  success: boolean;
  message: string;
  cdk: string;
  fid: string;
}

/**
 * 处理任务接口
 * @interface
 */
export interface ProcessTask {
  fid: string;
  cdk: string;
}

/**
 * API 错误类
 * @class
 * @extends {Error}
 */
export class ApiError extends Error {
  /**
   * 构造函数
   * @param code HTTP状态码
   * @param errCode 业务错误码
   * @param message 错误消息
   */
  constructor(
    public readonly code: number,
    public readonly errCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
} 