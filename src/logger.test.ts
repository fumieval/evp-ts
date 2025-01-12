import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleLogger, ILogger } from './logger';

describe('Logger', () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = new ConsoleLogger();
  });

  describe('log', () => {
    it('should log messages correctly', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logger.info(`KEY=value`);
      
      expect(consoleSpy).toMatchSnapshot();
      consoleSpy.mockRestore();
    });
  });

  describe('error', () => {
    it('should log errors correctly', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      logger.error(`KEY=value ERROR: test error`);
      
      expect(consoleSpy).toMatchSnapshot();
      consoleSpy.mockRestore();
    });
  });
});