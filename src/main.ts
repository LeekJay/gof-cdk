import * as fs from "node:fs/promises";
import * as path from "node:path";
import { processSingleCode, removeSuccessfulTask } from "./api";
import { loadConfig } from "./config";
import { useLogger } from "./logger";
import type { GiftCodeResult, ProcessTask } from "./types";
import { sleep } from "./utils";

// 创建日志记录器
const logger = useLogger();

/**
 * 处理结果统计
 */
interface ResultStats {
	success: number;
	failure: number;
	timeout: number;
	alreadyClaimed: number;
}

/**
 * 处理礼包码
 * @param cdks 礼包码列表
 * @param fids 玩家ID列表
 * @returns 处理结果列表
 */
const processGiftCodes = async (
	cdks: string[],
	fids: string[],
): Promise<GiftCodeResult[]> => {
	logger.info(
		`开始处理礼包码，共 ${cdks.length} 个礼包码，${fids.length} 个玩家ID`,
	);

	const tasks: ProcessTask[] = fids.flatMap((fid) =>
		cdks.map((cdk) => ({ fid, cdk })),
	);

	logger.info(`生成任务列表，共 ${tasks.length} 个任务`);

	// 结果和统计
	const results: GiftCodeResult[] = [];
	const stats: ResultStats = {
		success: 0,
		failure: 0,
		timeout: 0,
		alreadyClaimed: 0,
	};

	// 串行处理所有任务
	for (const task of tasks) {
		try {
			// 串行处理单个任务
			const result = await processSingleCode(task);

			// 更新统计信息
			if (result.success) {
				if (result.message.includes("已领过")) {
					stats.alreadyClaimed++;
				} else {
					stats.success++;
				}
			} else {
				if (
					result.message.includes("TIMEOUT") ||
					result.message.includes("超时")
				) {
					stats.timeout++;
				} else {
					stats.failure++;
				}
			}

			results.push(result);

			// 每个任务之间添加短暂延迟，避免验证码机制触发限制
			await sleep(500);
		} catch (error) {
			// 单个任务处理失败
			logger.error(`任务执行失败: ${error}`);
			const failedResult: GiftCodeResult = {
				success: false,
				message: `处理失败: ${error instanceof Error ? error.message : String(error)}`,
				cdk: task.cdk,
				fid: task.fid,
			};
			results.push(failedResult);
			stats.failure++;
		}
	}

	return results;
};

/**
 * 处理失败任务文件
 * @param filePath 失败任务文件路径
 * @returns 处理结果列表
 */
const processFailedTasks = async (
	filePath: string,
): Promise<GiftCodeResult[]> => {
	try {
		// 读取失败任务文件
		const fileContent = await fs.readFile(filePath, "utf8");
		const tasks: ProcessTask[] = JSON.parse(fileContent);

		if (!Array.isArray(tasks) || tasks.length === 0) {
			logger.info("失败任务文件为空或格式不正确");
			return [];
		}

		logger.info(`开始处理失败任务，共 ${tasks.length} 个任务`);

		// 结果和统计
		const results: GiftCodeResult[] = [];
		const stats: ResultStats = {
			success: 0,
			failure: 0,
			timeout: 0,
			alreadyClaimed: 0,
		};

		// 串行处理所有任务
		for (const task of tasks) {
			try {
				// 串行处理单个任务
				const result = await processSingleCode(task);

				// 更新统计信息
				if (result.success) {
					if (result.message.includes("已领过")) {
						stats.alreadyClaimed++;
					} else {
						stats.success++;
					}

					// 任务成功，立即从失败任务文件中删除
					await removeSuccessfulTask(filePath, task);
					logger.debug(`成功任务 [${task.fid}-${task.cdk}] 已从失败列表中删除`);
				} else {
					if (
						result.message.includes("TIMEOUT") ||
						result.message.includes("超时")
					) {
						stats.timeout++;
					} else {
						stats.failure++;
					}
				}

				results.push(result);

				// 每个任务之间添加短暂延迟，避免验证码机制触发限制
				await sleep(500);
			} catch (error) {
				// 单个任务处理失败
				logger.error(`任务执行失败: ${error}`);
				const failedResult: GiftCodeResult = {
					success: false,
					message: `处理失败: ${error instanceof Error ? error.message : String(error)}`,
					cdk: task.cdk,
					fid: task.fid,
				};
				results.push(failedResult);
				stats.failure++;
			}
		}

		// 输出最终统计结果
		logger.info(
			`所有任务处理完成，总成功: ${stats.success}，已领过: ${stats.alreadyClaimed}，总超时: ${stats.timeout}，总失败: ${stats.failure}`,
		);

		return results;
	} catch (error) {
		logger.error("处理失败任务文件时出错:", error);
		return [];
	}
};

/**
 * 输出任务执行统计报告
 * @param stats 统计数据
 * @param results 结果列表
 */
const printTaskSummary = (
	stats: {
		success: number;
		failure: number;
		timeout: number;
		alreadyClaimed: number;
	},
	results: GiftCodeResult[],
): void => {
	const totalTasks =
		stats.success + stats.alreadyClaimed + stats.timeout + stats.failure;
	const successRate =
		totalTasks > 0
			? (((stats.success + stats.alreadyClaimed) / totalTasks) * 100).toFixed(1)
			: "0.0";

	// 统计报告头部
	logger.info("\n" + "=".repeat(70));
	logger.info("🎆 统计报告 - 任务执行完成");
	logger.info("=".repeat(70));

	// 总体统计
	logger.info(`📈 总任务数：${totalTasks} 个`);
	logger.info(`✅ 成功领取：${stats.success} 个`);
	logger.info(`🔄 已领过的：${stats.alreadyClaimed} 个`);
	logger.info(`⏰ 超时失败：${stats.timeout} 个`);
	logger.info(`❌ 其他失败：${stats.failure} 个`);
	logger.info(`📊 成功率：${successRate}% (含已领取)`);

	// 成功的任务详情
	const successTasks = results.filter((r) => r.success);
	if (successTasks.length > 0) {
		logger.info("\n✅ 成功的任务:");
		successTasks.forEach((task) => {
			logger.info(`  - FID: ${task.fid} | CDK: ${task.cdk} | ${task.message}`);
		});
	}

	// 失败的任务详情
	const failedTasks = results.filter((r) => !r.success);
	if (failedTasks.length > 0) {
		logger.info("\n❌ 失败的任务:");
		failedTasks.forEach((task) => {
			logger.info(`  - FID: ${task.fid} | CDK: ${task.cdk} | ${task.message}`);
		});
	}

	logger.info("=".repeat(70));
	if (failedTasks.length > 0) {
		logger.info(
			"💾 失败的任务已保存到 failed_tasks/ 目录，可使用 --process-failed 参数重试",
		);
	}
	logger.result("🎉 程序执行完成！");
};

/**
 * 主程序入口
 */
async function main(): Promise<void> {
	try {
		// 加载配置
		const config = await loadConfig();

		// 检查命令行参数
		const args = process.argv.slice(2);
		const isProcessingFailedTasks = args.includes("--process-failed");

		if (isProcessingFailedTasks) {
			// 处理失败任务
			const failedTasksDir = path.join(process.cwd(), "failed_tasks");

			try {
				// 获取目录中的所有文件
				const files = await fs.readdir(failedTasksDir);
				const jsonFiles = files.filter((file) => file.endsWith(".json"));

				if (jsonFiles.length === 0) {
					logger.error("没有找到失败任务文件");
					process.exit(1);
				}

				// 按时间排序，处理最新的文件
				jsonFiles.sort();
				const latestFile = jsonFiles[jsonFiles.length - 1];
				const filePath = path.join(failedTasksDir, latestFile);

				logger.info(`开始处理失败任务文件: ${latestFile}`);

				// 处理失败任务
				const startTime = Date.now();
				const results = await processFailedTasks(filePath);
				const endTime = Date.now();

				// 计算成功和失败数量
				const successResults = results.filter((r) => r.success);
				const successCount = successResults.length;
				const alreadyClaimedCount = successResults.filter((r) =>
					r.message.includes("已领过"),
				).length;
				const newClaimCount = successCount - alreadyClaimedCount;
				const failureCount = results.length - successCount;
				const timeoutCount = results.filter(
					(r) =>
						!r.success &&
						(r.message.includes("TIMEOUT") || r.message.includes("超时")),
				).length;
				const otherFailureCount = failureCount - timeoutCount;

				// 输出失败任务处理统计
				logger.info(
					`\n⏱️ 执行用时: ${((endTime - startTime) / 1000).toFixed(2)} 秒`,
				);
				const failedStats = {
					success: newClaimCount,
					alreadyClaimed: alreadyClaimedCount,
					timeout: timeoutCount,
					failure: otherFailureCount,
				};
				printTaskSummary(failedStats, results);
			} catch (error) {
				logger.error("处理失败任务时出错:", error);
				process.exit(1);
			}
		} else {
			// 正常处理礼包码
			// 验证输入数据
			if (config.cdks.length === 0 || config.fids.length === 0) {
				logger.error("配置错误: 礼包码或玩家ID列表为空");
				process.exit(1);
			}

			// 处理礼包码
			const startTime = Date.now();
			const results = await processGiftCodes(config.cdks, config.fids);
			const endTime = Date.now();

			// 计算成功和失败数量
			const successResults = results.filter((r) => r.success);
			const successCount = successResults.length;
			const alreadyClaimedCount = successResults.filter((r) =>
				r.message.includes("已领过"),
			).length;
			const newClaimCount = successCount - alreadyClaimedCount;
			const failureCount = results.length - successCount;
			const timeoutCount = results.filter(
				(r) =>
					!r.success &&
					(r.message.includes("TIMEOUT") || r.message.includes("超时")),
			).length;
			const otherFailureCount = failureCount - timeoutCount;

			// 输出正常任务处理统计
			logger.info(
				`\n⏱️ 执行用时: ${((endTime - startTime) / 1000).toFixed(2)} 秒`,
			);
			const normalStats = {
				success: newClaimCount,
				alreadyClaimed: alreadyClaimedCount,
				timeout: timeoutCount,
				failure: otherFailureCount,
			};
			printTaskSummary(normalStats, results);
		}

		process.exit(0);
	} catch (error) {
		logger.error("程序运行失败:", error);
		process.exit(1);
	}
}

main();
