/**
 * 日志级别枚举
 */
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  RESULT = 2,
  WARN = 3,
  ERROR = 4
}

/**
 * 控制台颜色代码
 */
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // 前景色
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
  },
  
  // 背景色
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m'
  }
};

/**
 * 日志工具类
 */
export class Logger {
  private static instance: Logger | null = null;
  private static developmentMode: boolean | null = null;
  private static logLevel: LogLevel = LogLevel.RESULT; // 默认生产环境只显示结果和错误
  private namespace: string;

  /**
   * 构造函数
   * @param namespace 日志命名空间
   */
  constructor(namespace = '') {
    this.namespace = namespace;
    // 不再调用initLogLevel，改为在需要时检查
  }

  /**
   * 设置日志级别
   * @param isDevelopment 是否为开发模式
   */
  public static setDevelopmentMode(isDevelopment: boolean): void {
    Logger.developmentMode = isDevelopment;
    Logger.logLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.RESULT;
  }

  /**
   * 获取单例实例
   * @returns Logger实例
   */
  public static getInstance(namespace = ''): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(namespace);
    }
    return Logger.instance;
  }

  /**
   * 获取命名空间
   * @returns 命名空间
   */
  public getNamespace(): string {
    return this.namespace;
  }

  /**
   * 获取格式化的时间戳
   * @returns 格式化的时间戳字符串
   */
  private static getTimestamp(): string {
    const now = new Date();
    return `${now.toISOString().replace('T', ' ').substring(0, 19)}`;
  }

  /**
   * 获取开发模式状态
   * 直接从环境变量读取，不再依赖config
   * @returns 是否开启开发模式
   */
  private static getDevelopmentMode(): boolean {
    if (Logger.developmentMode === null) {
      // 直接从环境变量读取
      Logger.developmentMode = process.env.DEVELOPMENT_MODE === 'true';
      Logger.logLevel = Logger.developmentMode ? LogLevel.DEBUG : LogLevel.RESULT;
    }
    return Logger.developmentMode;
  }

  /**
   * 格式化日志信息
   * @param level 日志级别
   * @param message 日志消息
   * @param args 其他参数
   * @returns 格式化后的日志消息
   */
  private formatLog(level: string, color: string, message: string, args: unknown[]): string {
    const timestamp = Colors.fg.gray + Logger.getTimestamp() + Colors.reset;
    const levelStr = color + level + Colors.reset;
    const namespaceStr = this.namespace 
      ? Colors.fg.cyan + `[${this.namespace}]` + Colors.reset 
      : '';
    
    return `${timestamp} ${levelStr} ${namespaceStr} ${message}`;
  }

  /**
   * 调试日志（静态方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public static debug(message: string, ...args: unknown[]): void {
    // 只在开发模式下显示调试日志
    if (Logger.getDevelopmentMode() && Logger.logLevel <= LogLevel.DEBUG) {
      const formattedMsg = `${Colors.fg.gray}[DEBUG]${Colors.reset} ${message}`;
      console.log(formattedMsg, ...args);
    }
  }

  /**
   * 信息日志（静态方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public static info(message: string, ...args: unknown[]): void {
    // 只在开发模式下显示信息日志
    // 领取结果会通过 result 方法记录
    if (Logger.getDevelopmentMode() && Logger.logLevel <= LogLevel.INFO) {
      const formattedMsg = `${Colors.fg.blue}[INFO]${Colors.reset} ${message}`;
      console.log(formattedMsg, ...args);
    }
  }

  /**
   * 领取结果日志（静态方法）
   * 无论是否为开发模式，都会显示
   * @param message 日志消息
   * @param args 其他参数
   */
  public static result(message: string, ...args: unknown[]): void {
    const formattedMsg = `${Colors.fg.green}[RESULT]${Colors.reset} ${message}`;
    console.log(formattedMsg, ...args);
  }

  /**
   * 警告日志（静态方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public static warn(message: string, ...args: unknown[]): void {
    if (Logger.getDevelopmentMode() && Logger.logLevel <= LogLevel.WARN) {
      const formattedMsg = `${Colors.fg.yellow}[WARN]${Colors.reset} ${message}`;
      console.warn(formattedMsg, ...args);
    }
  }

  /**
   * 错误日志（静态方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public static error(message: string, ...args: unknown[]): void {
    const formattedMsg = `${Colors.fg.red}[ERROR]${Colors.reset} ${message}`;
    console.error(formattedMsg, ...args);
  }

  /**
   * 调试日志（实例方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public debug(message: string, ...args: unknown[]): void {
    if (Logger.getDevelopmentMode() && Logger.logLevel <= LogLevel.DEBUG) {
      const formattedMsg = this.formatLog('DEBUG', Colors.fg.gray, message, args);
      console.log(formattedMsg, ...args);
    }
  }

  /**
   * 信息日志（实例方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public info(message: string, ...args: unknown[]): void {
    if (Logger.getDevelopmentMode() && Logger.logLevel <= LogLevel.INFO) {
      const formattedMsg = this.formatLog('INFO', Colors.fg.blue, message, args);
      console.log(formattedMsg, ...args);
    }
  }

  /**
   * 领取结果日志（实例方法）
   * 无论是否为开发模式，都会显示
   * @param message 日志消息
   * @param args 其他参数
   */
  public result(message: string, ...args: unknown[]): void {
    const formattedMsg = this.formatLog('RESULT', Colors.fg.green, message, args);
    console.log(formattedMsg, ...args);
  }

  /**
   * 警告日志（实例方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public warn(message: string, ...args: unknown[]): void {
    if (Logger.getDevelopmentMode() && Logger.logLevel <= LogLevel.WARN) {
      const formattedMsg = this.formatLog('WARN', Colors.fg.yellow, message, args);
      console.warn(formattedMsg, ...args);
    }
  }

  /**
   * 错误日志（实例方法）
   * @param message 日志消息
   * @param args 其他参数
   */
  public error(message: string, ...args: unknown[]): void {
    const formattedMsg = this.formatLog('ERROR', Colors.fg.red, message, args);
    console.error(formattedMsg, ...args);
  }
}

export const useLogger = (namespace = '') => new Logger(namespace);