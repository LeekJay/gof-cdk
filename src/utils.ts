import CryptoJS from 'crypto-js';
import type { InputObject } from './types';
import { useLogger } from './logger';

// 创建日志记录器
const logger = useLogger('Utils');

/**
 * 睡眠函数
 * @param ms 睡眠毫秒数
 * @returns {Promise<void>} 延迟Promise
 */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 生成带签名的请求对象
 * @param inputObject 原始请求对象
 * @param signSalt 签名盐
 * @returns {InputObject & { sign: string }} 带签名的请求对象
 */
export function generateSignedObject(inputObject: InputObject, signSalt: string): InputObject & { sign: string } {
  try {
    const sortedQueryString = Object.keys(inputObject)
      .sort()
      .map(key => {
        const value = typeof inputObject[key] === 'object' ? JSON.stringify(inputObject[key]) : inputObject[key];
        return `${key}=${value}`;
      })
      .join('&');

    const sign = CryptoJS.MD5(sortedQueryString + signSalt).toString();

    return { sign, ...inputObject };
  } catch (error) {
    logger.error('生成签名对象时出错:', error);
    throw new Error(`生成签名失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 安全地解析JSON
 * @param json JSON字符串
 * @param defaultValue 解析失败时的默认值
 * @returns 解析后的对象
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.warn(`解析JSON失败，使用默认值: ${error instanceof Error ? error.message : '未知错误'}`);
    return defaultValue;
  }
}

/**
 * 随机延迟函数，用于添加抖动避免请求同时发出
 * @param baseMs 基础延迟（毫秒）
 * @param jitterMs 抖动范围（毫秒）
 * @returns {Promise<void>} 延迟Promise
 */
export const sleepWithJitter = async (baseMs: number, jitterMs: number): Promise<void> => {
  const jitter = Math.floor(Math.random() * jitterMs);
  const delay = baseMs + jitter;
  await sleep(delay);
};

/**
 * 限制函数执行频率（节流）
 * @param fn 要执行的函数
 * @param delay 延迟毫秒数
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall < delay) return;
    lastCall = now;
    return fn.apply(this, args);
  };
}

/**
 * 在指定时间后只执行最后一次调用（防抖）
 * @param fn 要执行的函数
 * @param delay 延迟毫秒数
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null;
  return function(this: any, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 重试函数，在失败时按指定策略重试
 * @param fn 要执行的异步函数
 * @param maxRetries 最大重试次数
 * @param delay 重试间隔（毫秒）
 * @param backoff 退避倍数，每次重试延迟增加的倍数
 * @returns 包装后的带重试功能的函数
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  maxRetries: number = 3,
  delay: number = 1000,
  backoff: number = 2
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async function(this: any, ...args: Parameters<T>): Promise<ReturnType<T>> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.debug(`重试操作 (尝试 ${attempt}/${maxRetries})`);
        }
        return await fn.apply(this, args);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const retryDelay = delay * Math.pow(backoff, attempt);
          logger.debug(`操作失败，将在 ${retryDelay}ms 后重试`);
          await sleep(retryDelay);
        }
      }
    }
    throw lastError;
  };
}

/**
 * 格式化时间为 YYYY-MM-DD HH:mm:ss 格式
 * @param date 日期对象，默认为当前时间
 * @returns 格式化后的时间字符串
 */
export function formatDateTime(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}