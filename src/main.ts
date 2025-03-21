import { loadConfig } from './config';
import { processSingleCode } from './api';
import type { ProcessTask, GiftCodeResult } from './types';
import { sleep } from './utils';
import { useLogger } from './logger';

// 创建日志记录器
const logger = useLogger('Main');

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
      // 并行处理批次中的任务
      const batchPromises = batch.map(task => processSingleCode(task));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // 处理每个任务的结果
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          // 成功完成的请求
          results.push(result.value);
          
          // 更新统计信息
          if (result.value.success) {
            if (result.value.message.includes('已领过')) {
              stats.alreadyClaimed++;
            } else {
              stats.success++;
            }
          } else {
            if (result.value.message.includes('TIMEOUT')) {
              stats.timeout++;
            } else {
              stats.failure++;
            }
          }
        } else {
          // 请求过程中出错
          logger.error(`任务执行失败: ${result.reason}`);
          const failedTask = batch[index];
          results.push({
            success: false,
            message: `处理失败: ${result.reason}`,
            cdk: failedTask.cdk,
            fid: failedTask.fid
          });
          stats.failure++;
        }
      });
      
      // 输出当前批次的统计信息
      logger.info(
        `批次 ${currentBatch}/${totalBatches} 处理完成，` +
        `成功: ${batchResults.filter(r => r.status === 'fulfilled' && r.value.success && !r.value.message.includes('已领过')).length}，` +
        `已领过: ${batchResults.filter(r => r.status === 'fulfilled' && r.value.success && r.value.message.includes('已领过')).length}，` +
        `超时: ${batchResults.filter(r => r.status === 'fulfilled' && !r.value.success && r.value.message.includes('TIMEOUT')).length}，` +
        `其他失败: ${batchResults.filter(r => r.status === 'fulfilled' && !r.value.success && !r.value.message.includes('TIMEOUT')).length}，` +
        `请求错误: ${batchResults.filter(r => r.status === 'rejected').length}`
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
 * 主程序入口
 */
async function main(): Promise<void> {
  try {
    // 加载配置
    const config = await loadConfig();
    
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

    // 使用 result 方法记录最终统计结果，确保在生产环境中也会显示
    logger.result(`处理完成，总用时 ${((endTime - startTime) / 1000).toFixed(2)}秒`);
    logger.result(`成功领取 ${newClaimCount} 个，已领过 ${alreadyClaimedCount} 个，失败 ${failureCount} 个`);
    process.exit(0);
  } catch (error) {
    logger.error('程序运行失败:', error);
    process.exit(1);
  }
}

// 启动程序
main();