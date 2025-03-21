import dotenv from 'dotenv';
import { z } from 'zod';
import { watch } from 'node:fs/promises';
import { useLogger, Logger } from './logger';

// 初始化时不使用logger，避免循环依赖
let loggerInitialized = false;
let logger: any;

/**
 * 配置架构定义
 */
const ConfigSchema = z.object({
  cdks: z.array(z.string().trim().min(1)).min(1, "至少需要一个礼包码"),
  fids: z.array(z.string().trim().min(1)).min(1, "至少需要一个玩家ID"),
  batchSize: z.number().int().positive().default(2),
  batchDelay: z.number().int().nonnegative().default(3000),
  maxRetries: z.number().int().nonnegative().default(5),
  timeout: z.number().int().positive().default(20000),
  developmentMode: z.boolean().default(false),
  apiBaseUrl: z.string().url("API基础URL必须是有效的URL").default("https://wjdr-giftcode-api.campfiregames.cn/api"),
  signSalt: z.string().min(1, "签名盐值不能为空").default("Uiv#87#SPan.ECsp")
});

/**
 * 配置类型
 */
type ConfigType = z.infer<typeof ConfigSchema>;

/**
 * 环境变量默认值
 */
const DEFAULT_ENV = {
  CDK_LIST: '',
  FID_LIST: '',
  BATCH_SIZE: '2',
  BATCH_DELAY: '3000',
  MAX_RETRIES: '5',
  TIMEOUT: '20000',
  DEVELOPMENT_MODE: 'false',
  API_BASE_URL: 'https://wjdr-giftcode-api.campfiregames.cn/api',
  SIGN_SALT: 'Uiv#87#SPan.ECsp'
};

/**
 * 配置管理器
 * @class
 */
class ConfigManager {
  private static instance: ConfigManager;
  private cachedConfig: ConfigType | null = null;
  private configChangeListeners: Array<(config: ConfigType) => void> = [];

  private constructor() {
    // 立即加载一次配置
    this.loadConfigInternal().then(config => {
      this.cachedConfig = config;
      
      // 设置Logger的开发模式
      Logger.setDevelopmentMode(config.developmentMode);
      
      // 初始化logger
      if (!loggerInitialized) {
        logger = useLogger('Config');
        loggerInitialized = true;
      }
      
      // 现在可以安全使用logger了
      logger.info('配置已加载');
    }).catch(err => {
      console.error('初始配置加载失败:', err);
    });
    
    // 启动配置文件监控
    this.watchConfigChanges();
  }

  /**
   * 单例模式获取实例
   * @returns {ConfigManager} 配置管理器实例
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 加载配置
   * @returns {Promise<ConfigType>} 配置对象
   */
  public async loadConfig(): Promise<ConfigType> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    this.cachedConfig = await this.loadConfigInternal();
    return this.cachedConfig;
  }
  
  /**
   * 添加配置变更监听器
   * @param listener 监听器函数
   */
  public addChangeListener(listener: (config: ConfigType) => void): void {
    this.configChangeListeners.push(listener);
  }
  
  /**
   * 移除配置变更监听器
   * @param listener 要移除的监听器函数
   */
  public removeChangeListener(listener: (config: ConfigType) => void): void {
    const index = this.configChangeListeners.indexOf(listener);
    if (index !== -1) {
      this.configChangeListeners.splice(index, 1);
    }
  }

  /**
   * 内部加载配置实现
   * @returns {Promise<ConfigType>} 配置对象
   * @private
   */
  private async loadConfigInternal(): Promise<ConfigType> {
    try {
      // 加载.env文件
      dotenv.config();

      // 从环境变量中读取配置，使用默认值作为备选
      const envConfig = {
        CDK_LIST: process.env.CDK_LIST || DEFAULT_ENV.CDK_LIST,
        FID_LIST: process.env.FID_LIST || DEFAULT_ENV.FID_LIST,
        BATCH_SIZE: process.env.BATCH_SIZE || DEFAULT_ENV.BATCH_SIZE,
        BATCH_DELAY: process.env.BATCH_DELAY || DEFAULT_ENV.BATCH_DELAY,
        MAX_RETRIES: process.env.MAX_RETRIES || DEFAULT_ENV.MAX_RETRIES,
        TIMEOUT: process.env.TIMEOUT || DEFAULT_ENV.TIMEOUT,
        DEVELOPMENT_MODE: process.env.DEVELOPMENT_MODE || DEFAULT_ENV.DEVELOPMENT_MODE,
        API_BASE_URL: process.env.API_BASE_URL || DEFAULT_ENV.API_BASE_URL,
        SIGN_SALT: process.env.SIGN_SALT || DEFAULT_ENV.SIGN_SALT
      };

      // 处理和验证配置
      const config = {
        cdks: envConfig.CDK_LIST.split(',').map(s => s.trim()).filter(Boolean),
        fids: envConfig.FID_LIST.split(',').map(s => s.trim()).filter(Boolean),
        batchSize: parseInt(envConfig.BATCH_SIZE, 10),
        batchDelay: parseInt(envConfig.BATCH_DELAY, 10),
        maxRetries: parseInt(envConfig.MAX_RETRIES, 10),
        timeout: parseInt(envConfig.TIMEOUT, 10),
        developmentMode: envConfig.DEVELOPMENT_MODE.toLowerCase() === 'true',
        apiBaseUrl: envConfig.API_BASE_URL,
        signSalt: envConfig.SIGN_SALT
      };
      
      // 使用Zod验证并返回配置
      return ConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('配置验证失败:', error.errors);
      } else {
        console.error('配置加载失败:', error);
      }
      throw error;
    }
  }

  /**
   * 监控配置文件变更
   * @private
   */
  private async watchConfigChanges(): Promise<void> {
    try {
      if (loggerInitialized) {
        logger.debug('开始监控.env文件变更');
      } else {
        console.log('开始监控.env文件变更');
      }
      
      const watcher = watch('.env');
      
      for await (const event of watcher) {
        if (event.eventType === 'change') {
          const logMsg = '检测到.env文件变更，正在重新加载配置';
          loggerInitialized ? logger.info(logMsg) : console.log(logMsg);
          
          try {
            // 清除缓存的配置
            this.cachedConfig = null;
            
            // 重新加载配置
            const newConfig = await this.loadConfigInternal();
            this.cachedConfig = newConfig;
            
            // 更新Logger开发模式
            Logger.setDevelopmentMode(newConfig.developmentMode);
            
            // 通知所有监听器
            for (const listener of this.configChangeListeners) {
              try {
                listener(newConfig);
              } catch (listenerError) {
                const errMsg = '配置变更监听器执行失败:';
                loggerInitialized 
                  ? logger.error(errMsg, listenerError) 
                  : console.error(errMsg, listenerError);
              }
            }
            
            const successMsg = '配置已重新加载'; 
            loggerInitialized ? logger.info(successMsg) : console.log(successMsg);
          } catch (reloadError) {
            const errMsg = '配置重新加载失败:';
            loggerInitialized 
              ? logger.error(errMsg, reloadError) 
              : console.error(errMsg, reloadError);
          }
        }
      }
    } catch (err) {
      const errMsg = '配置监控失败:';
      loggerInitialized 
        ? logger.error(errMsg, err) 
        : console.error(errMsg, err);
    }
  }
}

export const configManager = ConfigManager.getInstance();
export const loadConfig = () => configManager.loadConfig();
export const addConfigChangeListener = (listener: (config: ConfigType) => void) => 
  configManager.addChangeListener(listener);
export const removeConfigChangeListener = (listener: (config: ConfigType) => void) => 
  configManager.removeChangeListener(listener);