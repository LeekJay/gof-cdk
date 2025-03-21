import axios, { type AxiosRequestConfig, type AxiosResponse, type AxiosInstance } from 'axios';
import type { ApiResponse, PlayerInfo, GiftCodeResult, ProcessTask } from './types';
import { generateSignedObject, sleep } from './utils';
import { useLogger } from './logger';
import { loadConfig, addConfigChangeListener, removeConfigChangeListener } from './config';

// 创建日志记录器
const logger = useLogger('API');

const BASE_DELAY = 1000;

/**
 * API服务类
 */
class ApiService {
  private instance!: AxiosInstance;
  private maxRetries: number = 5;
  private timeout: number = 20000;
  private apiBaseUrl: string = '';
  private signSalt: string = '';
  
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
      
      logger.debug(`API服务已初始化，最大重试次数: ${this.maxRetries}, 超时: ${this.timeout}ms`);
      logger.debug(`API服务使用基础URL: ${this.apiBaseUrl}`);
    } catch (error) {
      logger.error('初始化API服务失败:', error);
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
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: this.timeout
    });
    
    this.setupInterceptors();
  }
  
  /**
   * 配置变更处理器
   */
  private handleConfigChange = (config: any): void => {
    logger.debug('检测到配置变更，更新API服务参数');
    
    // 更新参数
    this.maxRetries = config.maxRetries;
    this.timeout = config.timeout;
    this.apiBaseUrl = config.apiBaseUrl;
    this.signSalt = config.signSalt;
    
    // 重新创建实例
    this.createAxiosInstance();
    
    logger.debug(`API服务参数已更新，最大重试次数: ${this.maxRetries}, 超时: ${this.timeout}ms`);
    logger.debug(`API服务使用更新后的基础URL: ${this.apiBaseUrl}`);
  }
  
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
        logger.error('请求拦截器错误:', error);
        return Promise.reject(error);
      }
    );
    
    // 响应拦截器
    this.instance.interceptors.response.use(
      (response) => {
        logger.debug(`请求成功 ${response.config.url}, 状态码: ${response.status}`);
        return response;
      },
      (error) => {
        if (axios.isAxiosError(error)) {
          logger.error(
            `请求失败 ${error.config?.url}:`,
            error.code,
            error.message,
            error.response?.status
          );
          
          // 处理429（请求过多）错误
          if (error.response?.status === 429 && error.config) {
            const delay = error.response?.headers['retry-after']
              ? Number.parseInt(error.response.headers['retry-after'], 10) * 1000
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
      }
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
    retries?: number
  ): Promise<AxiosResponse<ApiResponse<T>>> {
    const maxAttempts = retries ?? this.maxRetries;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        logger.debug(`尝试请求 ${config.url} (尝试 ${attempt + 1}/${maxAttempts})`);
        const response = await this.instance.request<ApiResponse<T>>(config);
        return response;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          // 处理超时错误，其他错误已在拦截器中处理
          if (error.code === 'ECONNABORTED') {
            const delay = BASE_DELAY * (attempt + 1);
            logger.debug(`请求超时，将在 ${delay}ms 后重试请求 ${config.url} (尝试 ${attempt + 1}/${maxAttempts})`);
            await sleep(delay);
          } else if (attempt === maxAttempts - 1) {
            // 最后一次重试失败，抛出错误
            throw error;
          } else {
            // 其他错误，重试
            const delay = BASE_DELAY * (attempt + 1);
            logger.debug(`请求失败，将在 ${delay}ms 后重试请求 ${config.url} (尝试 ${attempt + 1}/${maxAttempts})`);
            await sleep(delay);
          }
        } else {
          logger.error('非Axios错误，直接抛出:', error);
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
      const inputObject = {
        fid,
        time: Date.now()
      };

      const result = generateSignedObject(inputObject, this.signSalt);

      const response = await this.requestWithRetry<PlayerInfo>({
        method: 'post',
        url: '/player',
        data: result
      });

      return response.data.code === 0 ? response.data.data : null;
    } catch (error) {
      logger.error('获取玩家信息失败:', error);
      return null;
    }
  }
  
  /**
   * 处理礼包码
   * @param fid 玩家ID
   * @param cdk 礼包码
   * @returns 处理结果
   */
  async processGiftCode(fid: string, cdk: string): Promise<GiftCodeResult> {
    const errorMap: Record<number, string> = {
      40004: '服务器处理超时，请稍后重试',
      40007: '超出兑换时间，无法领取',
      40008: '已领过该礼包，不能重复领取'
    };
    
    try {
      const inputObject = {
        fid,
        cdk,
        time: Date.now()
      };

      const result = generateSignedObject(inputObject, this.signSalt);
      logger.debug(`开始请求礼包码 ${cdk} 对玩家 ${fid}`);
      
      const response = await this.requestWithRetry<null>({
        method: 'post',
        url: '/gift_code',
        data: result
      });
      
      logger.debug(`礼包码请求成功 ${cdk} 对玩家 ${fid}, 响应码: ${response.data.code}, 错误码: ${response.data.err_code}`);

      if (response.data.code === 0 || response.data.err_code === 40008) {
        return {
          success: true,
          message: response.data.err_code === 40008 ? '已领过该礼包' : '已成功领取',
          cdk,
          fid
        };
      }

      return {
        success: false,
        message: errorMap[response.data.err_code] || response.data.msg,
        cdk,
        fid
      };
    } catch (error) {
      // 检查是否为超时错误
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        logger.debug(`检测到超时错误，错误代码: ${error.code}，将自动重试`);
        
        // 等待一段时间后重试
        await sleep(2000);
        
        try {
          // 重新构建请求对象
          const retryInputObject = {
            fid,
            cdk,
            time: Date.now() // 使用新的时间戳
          };
          
          const retryResult = generateSignedObject(retryInputObject, this.signSalt);
          logger.debug(`超时后重试请求礼包码 ${cdk} 对玩家 ${fid}`);
          
          const retryResponse = await this.requestWithRetry<null>({
            method: 'post',
            url: '/gift_code',
            data: retryResult
          });
          
          if (retryResponse.data.code === 0 || retryResponse.data.err_code === 40008) {
            return {
              success: true,
              message: retryResponse.data.err_code === 40008 ? '已领过该礼包' : '已成功领取',
              cdk,
              fid
            };
          }
          
          return {
            success: false,
            message: errorMap[retryResponse.data.err_code] || retryResponse.data.msg,
            cdk,
            fid
          };
        } catch (retryError) {
          logger.error(`礼包码重试请求失败 ${cdk} 对玩家 ${fid}:`, retryError);
          return {
            success: false,
            message: '重试后仍然失败',
            cdk,
            fid
          };
        }
      } else {
        logger.error(`礼包码请求失败 ${cdk} 对玩家 ${fid}:`, error);
        return {
          success: false,
          message: error instanceof Error ? error.message : '未知错误',
          cdk,
          fid
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
export const processSingleCode = async (task: ProcessTask): Promise<GiftCodeResult> => {
  try {
    logger.debug(`开始处理玩家 ${task.fid} 的礼包码 ${task.cdk}`);
    
    const playerInfo = await apiService.getPlayerInfo(task.fid);
    if (!playerInfo) {
      logger.error(`无法获取玩家 ${task.fid} 的信息`);
      return {
        success: false,
        message: '无法获取玩家信息',
        cdk: task.cdk,
        fid: task.fid
      };
    }
    
    logger.debug(`成功获取玩家信息: ${playerInfo.nickname} (ID: ${playerInfo.kid})`);
    
    const result = await apiService.processGiftCode(task.fid, task.cdk);
    
    const message = result.success
      ? `[${playerInfo.kid}] - [${playerInfo.nickname}] 领取 ${task.cdk} 成功: ${result.message}`
      : `[${playerInfo.kid}] - [${playerInfo.nickname}] 领取 ${task.cdk} 失败: ${result.message}`;

    // 使用 result 方法记录领取结果，确保在生产环境中也会显示
    logger.result(message);

    return { ...result, message };
  } catch (error) {
    logger.error('处理礼包码时发生未捕获的错误:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
      cdk: task.cdk,
      fid: task.fid
    };
  }
};