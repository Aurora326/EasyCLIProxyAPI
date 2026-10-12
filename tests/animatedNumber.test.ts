import { describe, expect, test } from 'bun:test';
import { AnimatedNumber } from '../src/components/AnimatedNumber';

describe('AnimatedNumber 动画数字组件', () => {
  test('导出为有效组件函数', () => {
    expect(typeof AnimatedNumber).toBe('function');
  });
});
