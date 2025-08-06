import CryptoJS from "crypto-js";
import { useLogger } from "./logger";
import type { InputObject } from "./types";

// 创建日志记录器
const logger = useLogger("Utils");

/**
 * 睡眠函数
 * @param ms 睡眠毫秒数
 * @returns {Promise<void>} 延迟Promise
 */
export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 生成带签名的请求对象
 * @param inputObject 原始请求对象
 * @param signSalt 签名盐
 * @returns {InputObject & { sign: string }} 带签名的请求对象
 */
export function generateSignedObject(
	inputObject: InputObject,
	signSalt: string,
): InputObject & { sign: string } {
	try {
		const sortedQueryString = Object.keys(inputObject)
			.sort()
			.map((key) => {
				const value =
					typeof inputObject[key] === "object"
						? JSON.stringify(inputObject[key])
						: inputObject[key];
				return `${key}=${value}`;
			})
			.join("&");

		const sign = CryptoJS.MD5(sortedQueryString + signSalt).toString();

		return { sign, ...inputObject };
	} catch (error) {
		logger.error("生成签名对象时出错:", error);
		throw new Error(
			`生成签名失败: ${error instanceof Error ? error.message : "未知错误"}`,
		);
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
		logger.warn(
			`解析JSON失败，使用默认值: ${error instanceof Error ? error.message : "未知错误"}`,
		);
		return defaultValue;
	}
}
