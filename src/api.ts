import axios, {
	type AxiosRequestConfig,
	type AxiosResponse,
	type AxiosInstance,
} from "axios";
import { DdddOcr } from "ddddocr-node";
import {
	addConfigChangeListener,
	loadConfig,
	removeConfigChangeListener,
} from "./config";
import { useLogger } from "./logger";
import type {
	ApiResponse,
	Captcha,
	Config,
	GiftCodeResult,
	PlayerInfo,
	ProcessTask,
} from "./types";
import { generateSignedObject, sleep } from "./utils";

// 创建日志记录器
const logger = useLogger();

// 创建验证码识别器
const ocr = new DdddOcr();

const BASE_DELAY = 1000;

/**
 * API服务类
 */
class ApiService {
	private instance!: AxiosInstance;
	private maxRetries = 5;
	private timeout = 20000;
	private apiBaseUrl = "";
	private signSalt = "";

	constructor() {
		this.initFromConfig();

		// 监听配置变更
		addConfigChangeListener(this.handleConfigChange);
	}

	/**
	 * 从配置加载参数
	 */
	private async initFromConfig(): Promise<void> {
		try {
			const config = await loadConfig();
			this.maxRetries = config.maxRetries;
			this.timeout = config.timeout;
			this.apiBaseUrl = config.apiBaseUrl;
			this.signSalt = config.signSalt;

			// 创建实例
			this.createAxiosInstance();

			logger.debug(
				`API服务已初始化，最大重试次数: ${this.maxRetries}, 超时: ${this.timeout}ms`,
			);
			logger.debug(`API服务使用基础URL: ${this.apiBaseUrl}`);
		} catch (error) {
			logger.error("初始化API服务失败:", error);
			// 使用默认参数
			this.createAxiosInstance();
		}
	}

	/**
	 * 创建Axios实例
	 */
	private createAxiosInstance(): void {
		this.instance = axios.create({
			baseURL: this.apiBaseUrl,
			headers: {
				Accept: "application/json, text/plain, */*",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			timeout: this.timeout,
		});

		this.setupInterceptors();
	}

	/**
	 * 配置变更处理器
	 */
	private handleConfigChange = (config: Config): void => {
		logger.debug("检测到配置变更，更新API服务参数");

		// 更新参数
		this.maxRetries = config.maxRetries;
		this.timeout = config.timeout;
		this.apiBaseUrl = config.apiBaseUrl;
		this.signSalt = config.signSalt;

		// 重新创建实例
		this.createAxiosInstance();

		logger.debug(
			`API服务参数已更新，最大重试次数: ${this.maxRetries}, 超时: ${this.timeout}ms`,
		);
		logger.debug(`API服务使用更新后的基础URL: ${this.apiBaseUrl}`);
	};

	/**
	 * 设置请求和响应拦截器
	 */
	private setupInterceptors(): void {
		// 请求拦截器
		this.instance.interceptors.request.use(
			(config) => {
				logger.debug(`开始请求 ${config.url}`);
				return config;
			},
			(error) => {
				logger.error("请求拦截器错误:", error);
				return Promise.reject(error);
			},
		);

		// 响应拦截器
		this.instance.interceptors.response.use(
			(response) => {
				logger.debug(
					`请求成功 ${response.config.url}, 状态码: ${response.status}`,
				);
				return response;
			},
			(error) => {
				if (axios.isAxiosError(error)) {
					logger.error(
						`请求失败 ${error.config?.url}:`,
						error.code,
						error.message,
						error.response?.status,
					);

					// 处理429（请求过多）错误
					if (error.response?.status === 429 && error.config) {
						const delay = error.response?.headers["retry-after"]
							? Number.parseInt(error.response.headers["retry-after"], 10) *
								1000
							: BASE_DELAY;

						logger.debug(`将在 ${delay}ms 后自动重试请求`);
						return sleep(delay).then(() => {
							if (error.config) {
								return this.instance(error.config);
							}
							return Promise.reject(error);
						});
					}
				}

				return Promise.reject(error);
			},
		);
	}

	/**
	 * 带重试机制的请求
	 * @param config Axios请求配置
	 * @param retries 重试次数
	 * @returns 请求响应
	 */
	async requestWithRetry<T>(
		config: AxiosRequestConfig,
		retries?: number,
	): Promise<AxiosResponse<ApiResponse<T>>> {
		const maxAttempts = retries ?? this.maxRetries;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				logger.debug(
					`尝试请求 ${config.url} (尝试 ${attempt + 1}/${maxAttempts})`,
				);
				const response = await this.instance.request<ApiResponse<T>>(config);
				return response;
			} catch (error) {
				if (axios.isAxiosError(error)) {
					// 处理超时错误，其他错误已在拦截器中处理
					if (error.code === "ECONNABORTED") {
						const delay = BASE_DELAY * (attempt + 1);
						logger.debug(
							`请求超时，将在 ${delay}ms 后重试请求 ${config.url} (尝试 ${attempt + 1}/${maxAttempts})`,
						);
						await sleep(delay);
					} else if (attempt === maxAttempts - 1) {
						// 最后一次重试失败，抛出错误
						throw error;
					} else {
						// 其他错误，重试
						const delay = BASE_DELAY * (attempt + 1);
						logger.debug(
							`请求失败，将在 ${delay}ms 后重试请求 ${config.url} (尝试 ${attempt + 1}/${maxAttempts})`,
						);
						await sleep(delay);
					}
				} else {
					logger.error("非Axios错误，直接抛出:", error);
					throw error;
				}
			}
		}

		logger.error(`请求 ${config.url} 重试${maxAttempts}次后仍然失败`);
		throw new Error(`请求重试${maxAttempts}次后仍然失败`);
	}

	/**
	 * 获取玩家信息
	 * @param fid 玩家ID
	 * @returns 玩家信息或null
	 */
	async getPlayerInfo(fid: string): Promise<PlayerInfo | null> {
		try {
			const inputData = {
				fid,
				time: Date.now(),
			};

			const signedData = generateSignedObject(inputData, this.signSalt);

			const response = await this.requestWithRetry<PlayerInfo>({
				method: "post",
				url: "/player",
				data: signedData,
			});

			return response.data.code === 0 ? response.data.data : null;
		} catch (error) {
			logger.error("获取玩家信息失败:", error);
			return null;
		}
	}

	/**
	 * 获取验证码
	 * @param fid 玩家ID
	 * @returns 验证码
	 */
	async getCaptcha(fid: string): Promise<string> {
		try {
			const inputData = {
				fid,
				init: 0,
				time: Date.now(),
			};

			const signedData = generateSignedObject(inputData, this.signSalt);

			const response = await this.requestWithRetry<Captcha | null>({
				method: "post",
				url: "/captcha",
				data: signedData,
			});

			const captcha = await ocr.classification(response.data.data?.img ?? "");

			logger.info(`验证码: ${captcha}`);

			return captcha;
		} catch (error) {
			logger.error("获取验证码失败:", error);
			return "";
		}
	}

	/**
	 * 处理礼包码
	 * @param fid 玩家ID
	 * @param cdk 礼包码
	 * @param captcha_code 验证码
	 * @returns 处理结果
	 */
	async processGiftCode(
		fid: string,
		cdk: string,
		captcha_code: string,
	): Promise<GiftCodeResult> {
		const errorMap: Record<number, string> = {
			40004: "服务器处理超时，请稍后重试",
			40007: "超出兑换时间，无法领取",
			40008: "已领过该礼包，不能重复领取",
		};

		try {
			const inputData = {
				fid,
				cdk,
				captcha_code,
				time: Date.now(),
			};

			const signedData = generateSignedObject(inputData, this.signSalt);
			logger.debug(`开始请求礼包码 ${cdk} 对玩家 ${fid}`);

			const response = await this.requestWithRetry<null>({
				method: "post",
				url: "/gift_code",
				data: signedData,
			});

			logger.debug(
				`礼包码请求成功 ${cdk} 对玩家 ${fid}, 响应码: ${response.data.code}, 错误码: ${response.data.err_code}`,
			);

			if (response.data.code === 0 || response.data.err_code === 40008) {
				return {
					success: true,
					message:
						response.data.err_code === 40008 ? "已领过该礼包" : "已成功领取",
					cdk,
					fid,
				};
			}

			return {
				success: false,
				message: errorMap[response.data.err_code] || response.data.msg,
				cdk,
				fid,
			};
		} catch (error) {
			// 检查是否为超时错误
			if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
				logger.debug(`检测到超时错误，错误代码: ${error.code}，将自动重试`);

				// 等待一段时间后重试
				await sleep(2000);

				try {
					// 重新构建请求对象
					const retryInputObject = {
						fid,
						cdk,
						time: Date.now(), // 使用新的时间戳
					};

					const retryResult = generateSignedObject(
						retryInputObject,
						this.signSalt,
					);
					logger.debug(`超时后重试请求礼包码 ${cdk} 对玩家 ${fid}`);

					const retryResponse = await this.requestWithRetry<null>({
						method: "post",
						url: "/gift_code",
						data: retryResult,
					});

					if (
						retryResponse.data.code === 0 ||
						retryResponse.data.err_code === 40008
					) {
						return {
							success: true,
							message:
								retryResponse.data.err_code === 40008
									? "已领过该礼包"
									: "已成功领取",
							cdk,
							fid,
						};
					}

					return {
						success: false,
						message:
							errorMap[retryResponse.data.err_code] || retryResponse.data.msg,
						cdk,
						fid,
					};
				} catch (retryError) {
					logger.error(`礼包码重试请求失败 ${cdk} 对玩家 ${fid}:`, retryError);
					return {
						success: false,
						message: "重试后仍然失败",
						cdk,
						fid,
					};
				}
			} else {
				logger.error(`礼包码请求失败 ${cdk} 对玩家 ${fid}:`, error);
				return {
					success: false,
					message: error instanceof Error ? error.message : "未知错误",
					cdk,
					fid,
				};
			}
		}
	}

	/**
	 * 清理资源
	 */
	public dispose(): void {
		// 移除配置监听器
		removeConfigChangeListener(this.handleConfigChange);
	}
}

// 创建API服务实例
const apiService = new ApiService();

/**
 * 处理单个礼包码
 * @param task 处理任务
 * @returns 礼包码处理结果
 */
export const processSingleCode = async (
	task: ProcessTask,
): Promise<GiftCodeResult> => {
	try {
		logger.debug(`开始处理玩家 ${task.fid} 的礼包码 ${task.cdk}`);

		const playerInfo = await apiService.getPlayerInfo(task.fid);
		if (!playerInfo) {
			logger.error(`无法获取玩家 ${task.fid} 的信息`);
			return {
				success: false,
				message: "无法获取玩家信息",
				cdk: task.cdk,
				fid: task.fid,
			};
		}

		logger.debug(
			`成功获取玩家信息: ${playerInfo.nickname} (ID: ${playerInfo.kid})`,
		);

		// 最大重试次数
		const maxRetries = 3;
		let currentRetry = 0;
		let result: GiftCodeResult | null = null;

		// 重试循环
		while (currentRetry < maxRetries) {
			try {
				// 获取验证码
				const captcha_code = await apiService.getCaptcha(task.fid);

				// 验证码格式检查：长度必须为4且不包含中文
				const hasChinese = /[\u4e00-\u9fa5]/.test(captcha_code);
				if (captcha_code.length !== 4 || hasChinese) {
					// 验证码格式错误，进行重试
					currentRetry++;
					const retryMessage = `[${playerInfo.kid}] - [${playerInfo.nickname}] 识别验证码失败，正在进行重试...(${currentRetry}/${maxRetries})`;
					logger.error(retryMessage);

					if (currentRetry >= maxRetries) {
						// 达到最大重试次数，跳过当前任务
						const skipMessage = `[${playerInfo.kid}] - [${playerInfo.nickname}] 识别验证码失败，已达到最大重试次数(${maxRetries})，跳过当前id&cdk，执行下一个...`;
						logger.error(skipMessage);

						// 保存失败记录到本地
						await saveFailedTask(task);

						return {
							success: false,
							message: `[${playerInfo.kid}] - [${playerInfo.nickname}] 识别验证码失败，已达到最大重试次数(${maxRetries})，已保存失败记录`,
							cdk: task.cdk,
							fid: task.fid,
						};
					}

					// 等待一段时间再重试
					await sleep(1000);
					continue;
				}

				// 处理礼包码
				result = await apiService.processGiftCode(
					task.fid,
					task.cdk,
					captcha_code,
				);

				// 如果成功，直接返回结果
				if (result.success) {
					const message = `[${playerInfo.kid}] - [${playerInfo.nickname}] 领取 ${task.cdk} 成功: ${result.message}`;
					logger.result(message);
					return { ...result, message };
				}

				// 如果失败，进行重试
				currentRetry++;
				const retryMessage = `[${playerInfo.kid}] - [${playerInfo.nickname}] 领取 ${task.cdk} 失败: ${result.message}，正在进行重试...(${currentRetry}/${maxRetries})`;
				logger.error(retryMessage);

				if (currentRetry >= maxRetries) {
					// 达到最大重试次数，跳过当前任务
					const skipMessage = `[${playerInfo.kid}] - [${playerInfo.nickname}] 领取 ${task.cdk} 失败: ${result.message}，已达到最大重试次数(${maxRetries})，跳过当前id&cdk，执行下一个...`;
					logger.error(skipMessage);

					// 保存失败记录到本地
					await saveFailedTask(task);

					return {
						success: false,
						message: `${result.message}，已达到最大重试次数(${maxRetries})，已保存失败记录`,
						cdk: task.cdk,
						fid: task.fid,
					};
				}

				// 等待一段时间再重试
				await sleep(1000);
			} catch (error) {
				// 处理过程中出错，进行重试
				currentRetry++;
				const errorMessage =
					error instanceof Error ? error.message : "未知错误";
				const retryMessage = `[${playerInfo.kid}] - [${playerInfo.nickname}] 处理出错(${errorMessage})，正在进行重试...(${currentRetry}/${maxRetries})`;
				logger.error(retryMessage);

				if (currentRetry >= maxRetries) {
					// 达到最大重试次数，跳过当前任务
					const skipMessage = `[${playerInfo.kid}] - [${playerInfo.nickname}] 处理出错(${errorMessage})，已达到最大重试次数(${maxRetries})，跳过当前id&cdk，执行下一个...`;
					logger.error(skipMessage);

					// 保存失败记录到本地
					await saveFailedTask(task);

					return {
						success: false,
						message: `[${playerInfo.kid}] - [${playerInfo.nickname}] 处理出错(${errorMessage})，已达到最大重试次数(${maxRetries})，已保存失败记录`,
						cdk: task.cdk,
						fid: task.fid,
					};
				}

				// 等待一段时间再重试
				await sleep(1000);
			}
		}

		return (
			result || {
				success: false,
				message: "未知错误",
				cdk: task.cdk,
				fid: task.fid,
			}
		);
	} catch (error) {
		logger.error("处理礼包码时发生未捕获的错误:", error);
		return {
			success: false,
			message: error instanceof Error ? error.message : "未知错误",
			cdk: task.cdk,
			fid: task.fid,
		};
	}
};

/**
 * 保存失败任务到本地文件
 * @param task 失败的任务
 */
async function saveFailedTask(task: ProcessTask): Promise<void> {
	try {
		const { promises: fs } = await import("node:fs");
		const path = await import("node:path");

		// 确保目录存在
		const dirPath = path.join(process.cwd(), "failed_tasks");
		try {
			await fs.mkdir(dirPath, { recursive: true });
		} catch (err) {
			// 目录可能已存在，忽略错误
		}

		// 使用当前日期作为文件名，确保同一天的失败任务保存在同一个文件中
		const today = new Date().toISOString().split("T")[0]; // 格式：YYYY-MM-DD
		const fileName = `failed_tasks_${today}.json`;
		const filePath = path.join(dirPath, fileName);

		// 读取现有文件内容（如果存在）
		let existingTasks: ProcessTask[] = [];
		try {
			const fileContent = await fs.readFile(filePath, "utf8");
			existingTasks = JSON.parse(fileContent);
			if (!Array.isArray(existingTasks)) {
				existingTasks = [];
			}
		} catch (err) {
			// 文件不存在或内容无效，使用空数组
		}

		// 添加新的失败任务
		existingTasks.push(task);

		// 保存更新后的任务列表
		await fs.writeFile(
			filePath,
			JSON.stringify(existingTasks, null, 2),
			"utf8",
		);
		logger.debug(`失败任务已追加保存到: ${filePath}`);
	} catch (error) {
		logger.error("保存失败任务时出错:", error);
	}
}

/**
 * 从失败任务文件中删除成功的任务
 * @param filePath 失败任务文件路径
 * @param successfulTask 成功的任务
 */
async function removeSuccessfulTask(filePath: string, successfulTask: ProcessTask): Promise<void> {
	try {
		const { promises: fs } = await import("node:fs");

		// 读取现有文件内容
		let existingTasks: ProcessTask[] = [];
		try {
			const fileContent = await fs.readFile(filePath, "utf8");
			existingTasks = JSON.parse(fileContent);
			if (!Array.isArray(existingTasks)) {
				existingTasks = [];
			}
		} catch (err) {
			logger.debug("读取失败任务文件时出错或文件不存在，跳过删除操作");
			return;
		}

		// 删除成功的任务（匹配 fid 和 cdk）
		const updatedTasks = existingTasks.filter(
			task => !(task.fid === successfulTask.fid && task.cdk === successfulTask.cdk)
		);

		// 如果任务列表已清空，删除文件；否则保存更新后的任务列表
		if (updatedTasks.length === 0) {
			await fs.unlink(filePath);
			logger.debug(`所有失败任务已成功处理，删除文件: ${filePath}`);
		} else {
			await fs.writeFile(
				filePath,
				JSON.stringify(updatedTasks, null, 2),
				"utf8",
			);
			logger.debug(`成功任务已从失败列表中删除，剩余失败任务: ${updatedTasks.length} 个`);
		}
	} catch (error) {
		logger.error("删除成功任务时出错:", error);
	}
}

// 导出函数供其他模块使用
export { removeSuccessfulTask };
