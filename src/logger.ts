import pino from "pino";

/**
 * 创建 pino 日志实例
 * @param options 日志配置选项
 * @returns pino 日志实例
 */
export function createLogger(options?: {
	name?: string;
	level?: string;
}) {
	const isDevelopment = process.env.DEVELOPMENT_MODE === "true";

	const logger = pino({
		name: options?.name,
		level: options?.level || (isDevelopment ? "debug" : "info"),
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
				ignore: "pid,hostname",
			},
		},
	});

	// 添加自定义的result方法，与原来的logger兼容
	const loggerWithResult = logger as typeof logger & {
		result: typeof logger.info;
	};
	loggerWithResult.result = logger.info.bind(logger);

	return loggerWithResult;
}

// 创建默认日志实例
const defaultLogger = createLogger();

// 导出默认日志实例的方法
export const debug = defaultLogger.debug.bind(defaultLogger);
export const info = defaultLogger.info.bind(defaultLogger);
export const warn = defaultLogger.warn.bind(defaultLogger);
export const error = defaultLogger.error.bind(defaultLogger);
export const result = defaultLogger.info.bind(defaultLogger); // 兼容原有的result方法

// 创建命名空间日志实例的工具函数
export const useLogger = (namespace?: string) =>
	createLogger({ name: namespace });
