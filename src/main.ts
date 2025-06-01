import { loadConfig } from './config';
import { processSingleCode } from './api';
import type { ProcessTask, GiftCodeResult } from './types';
import { sleep } from './utils';
import { useLogger } from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';

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
 * 批量处理礼包码
 * @param cdks 礼包码列表
 * @param fids 玩家ID列表
 * @param batchSize 批次大小
 * @param batchDelay 批次间延迟（毫秒）
 * @returns 处理结果列表
 */
const processGiftCodes = async (
  cdks: string[],
  fids: string[],
  batchSize: number,
  batchDelay: number
): Promise<GiftCodeResult[]> => {
  logger.info(`开始处理礼包码，共 ${cdks.length} 个礼包码，${fids.length} 个玩家ID`);
  
  const tasks: ProcessTask[] = fids.flatMap(fid =>
    cdks.map(cdk => ({ fid, cdk }))
  );

  logger.info(`生成任务列表，共 ${tasks.length} 个任务`);
  
  // 结果和统计
  const results: GiftCodeResult[] = [];
  const stats: ResultStats = {
    success: 0,
    failure: 0,
    timeout: 0,
    alreadyClaimed: 0
  };

  // 按批次处理任务
  const totalBatches = Math.ceil(tasks.length / batchSize);
  for (let i = 0; i < tasks.length; i += batchSize) {
    const currentBatch = Math.floor(i / batchSize) + 1;
    const batch = tasks.slice(i, i + batchSize);
    logger.info(`处理批次 ${currentBatch}/${totalBatches}，批次大小: ${batch.length}`);
    
    try {
      // 串行处理批次中的任务
      const batchResults: GiftCodeResult[] = [];
      
      for (const task of batch) {
        try {
          // 串行处理单个任务
          const result = await processSingleCode(task);
          batchResults.push(result);
          
          // 更新统计信息
          if (result.success) {
            if (result.message.includes('已领过')) {
              stats.alreadyClaimed++;
            } else {
              stats.success++;
            }
          } else {
            if (result.message.includes('TIMEOUT') || result.message.includes('超时')) {
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
            fid: task.fid
          };
          batchResults.push(failedResult);
          results.push(failedResult);
          stats.failure++;
        }
      }
      
      // 输出当前批次的统计信息
      logger.info(
        `批次 ${currentBatch}/${totalBatches} 处理完成，` +
        `成功: ${batchResults.filter(r => r.success && !r.message.includes('已领过')).length}，` +
        `已领过: ${batchResults.filter(r => r.success && r.message.includes('已领过')).length}，` +
        `超时: ${batchResults.filter(r => !r.success && (r.message.includes('TIMEOUT') || r.message.includes('超时'))).length}，` +
        `其他失败: ${batchResults.filter(r => !r.success && !(r.message.includes('TIMEOUT') || r.message.includes('超时'))).length}`
      );
    } catch (error) {
      logger.error(`批次 ${currentBatch} 处理出错:`, error);
    }
    
    // 如果不是最后一批，等待一段时间再处理下一批
    if (i + batchSize < tasks.length) {
      logger.info(`等待 ${batchDelay}ms 后处理下一批`);
      await sleep(batchDelay);
    }
  }

  // 输出最终统计结果
  logger.info(
    `所有批次处理完成，` +
    `总成功: ${stats.success}，` +
    `已领过: ${stats.alreadyClaimed}，` +
    `总超时: ${stats.timeout}，` +
    `总失败: ${stats.failure}`
  );
  
  return results;
};

/**
 * 处理失败任务文件
 * @param filePath 失败任务文件路径
 * @param batchSize 批次大小
 * @param batchDelay 批次间延迟（毫秒）
 * @returns 处理结果列表
 */
const processFailedTasks = async (
  filePath: string,
  batchSize: number,
  batchDelay: number
): Promise<GiftCodeResult[]> => {
  try {
    // 读取失败任务文件
    const fileContent = await fs.readFile(filePath, 'utf8');
    const tasks: ProcessTask[] = JSON.parse(fileContent);
    
    if (!Array.isArray(tasks) || tasks.length === 0) {
      logger.info('失败任务文件为空或格式不正确');
      return [];
    }
    
    logger.info(`开始处理失败任务，共 ${tasks.length} 个任务`);
    
    // 结果和统计
    const results: GiftCodeResult[] = [];
    const stats: ResultStats = {
      success: 0,
      failure: 0,
      timeout: 0,
      alreadyClaimed: 0
    };

    // 按批次处理任务
    const totalBatches = Math.ceil(tasks.length / batchSize);
    for (let i = 0; i < tasks.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      const batch = tasks.slice(i, i + batchSize);
      logger.info(`处理批次 ${currentBatch}/${totalBatches}，批次大小: ${batch.length}`);
      
      try {
        // 串行处理批次中的任务
        const batchResults: GiftCodeResult[] = [];
        
        for (const task of batch) {
          try {
            // 串行处理单个任务
            const result = await processSingleCode(task);
            batchResults.push(result);
            
            // 更新统计信息
            if (result.success) {
              if (result.message.includes('已领过')) {
                stats.alreadyClaimed++;
              } else {
                stats.success++;
              }
            } else {
              if (result.message.includes('TIMEOUT') || result.message.includes('超时')) {
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
              fid: task.fid
            };
            batchResults.push(failedResult);
            results.push(failedResult);
            stats.failure++;
          }
        }
        
        // 输出当前批次的统计信息
        logger.info(
          `批次 ${currentBatch}/${totalBatches} 处理完成，` +
          `成功: ${batchResults.filter(r => r.success && !r.message.includes('已领过')).length}，` +
          `已领过: ${batchResults.filter(r => r.success && r.message.includes('已领过')).length}，` +
          `超时: ${batchResults.filter(r => !r.success && (r.message.includes('TIMEOUT') || r.message.includes('超时'))).length}，` +
          `其他失败: ${batchResults.filter(r => !r.success && !(r.message.includes('TIMEOUT') || r.message.includes('超时'))).length}`
        );
      } catch (error) {
        logger.error(`批次 ${currentBatch} 处理出错:`, error);
      }
      
      // 如果不是最后一批，等待一段时间再处理下一批
      if (i + batchSize < tasks.length) {
        logger.info(`等待 ${batchDelay}ms 后处理下一批`);
        await sleep(batchDelay);
      }
    }

    // 输出最终统计结果
    logger.info(
      `所有批次处理完成，` +
      `总成功: ${stats.success}，` +
      `已领过: ${stats.alreadyClaimed}，` +
      `总超时: ${stats.timeout}，` +
      `总失败: ${stats.failure}`
    );
    
    return results;
  } catch (error) {
    logger.error('处理失败任务文件时出错:', error);
    return [];
  }
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
    const isProcessingFailedTasks = args.includes('--process-failed');
    
    if (isProcessingFailedTasks) {
      // 处理失败任务
      const failedTasksDir = path.join(process.cwd(), 'failed_tasks');
      
      try {
        // 获取目录中的所有文件
        const files = await fs.readdir(failedTasksDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        if (jsonFiles.length === 0) {
          logger.error('没有找到失败任务文件');
          process.exit(1);
        }
        
        // 按时间排序，处理最新的文件
        jsonFiles.sort();
        const latestFile = jsonFiles[jsonFiles.length - 1];
        const filePath = path.join(failedTasksDir, latestFile);
        
        logger.info(`开始处理失败任务文件: ${latestFile}`);
        
        // 处理失败任务
        const startTime = Date.now();
        const results = await processFailedTasks(
          filePath,
          config.batchSize,
          config.batchDelay
        );
        const endTime = Date.now();
        
        // 计算成功和失败数量
        const successResults = results.filter(r => r.success);
        const successCount = successResults.length;
        const alreadyClaimedCount = successResults.filter(r => r.message.includes('已领过')).length;
        const newClaimCount = successCount - alreadyClaimedCount;
        const failureCount = results.length - successCount;
        const timeoutCount = results.filter(r => !r.success && (r.message.includes('TIMEOUT') || r.message.includes('超时'))).length;
        const otherFailureCount = failureCount - timeoutCount;
        
        // 使用 result 方法记录最终统计结果，确保在生产环境中也会显示
        logger.result(`失败任务处理完成，总用时 ${((endTime - startTime) / 1000).toFixed(2)}秒`);
        logger.result(
          `成功领取 ${newClaimCount} 个，` +
          `已领过 ${alreadyClaimedCount} 个，` +
          `超时 ${timeoutCount} 个，` +
          `其他失败 ${otherFailureCount} 个`
        );
      } catch (error) {
        logger.error('处理失败任务时出错:', error);
        process.exit(1);
      }
    } else {
      // 正常处理礼包码
      // 验证输入数据
      if (config.cdks.length === 0 || config.fids.length === 0) {
        logger.error('配置错误: 礼包码或玩家ID列表为空');
        process.exit(1);
      }
      
      // 处理礼包码
      const startTime = Date.now();
      const results = await processGiftCodes(
        config.cdks, 
        config.fids,
        config.batchSize,
        config.batchDelay
      );
      const endTime = Date.now();
      
      // 计算成功和失败数量
      const successResults = results.filter(r => r.success);
      const successCount = successResults.length;
      const alreadyClaimedCount = successResults.filter(r => r.message.includes('已领过')).length;
      const newClaimCount = successCount - alreadyClaimedCount;
      const failureCount = results.length - successCount;
      const timeoutCount = results.filter(r => !r.success && (r.message.includes('TIMEOUT') || r.message.includes('超时'))).length;
      const otherFailureCount = failureCount - timeoutCount;
      
      // 使用 result 方法记录最终统计结果，确保在生产环境中也会显示
      logger.result(`处理完成，总用时 ${((endTime - startTime) / 1000).toFixed(2)}秒`);
      logger.result(
        `成功领取 ${newClaimCount} 个，` +
        `已领过 ${alreadyClaimedCount} 个，` +
        `超时 ${timeoutCount} 个，` +
        `其他失败 ${otherFailureCount} 个`
      );
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('程序运行失败:', error);
    process.exit(1);
  }
}

main();