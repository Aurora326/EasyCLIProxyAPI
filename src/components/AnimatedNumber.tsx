import { useEffect, useRef, useState } from 'react';

export interface AnimatedNumberProps {
  /** 目标数值 */
  value: number;
  /** 动画时长（毫秒），默认 420ms */
  duration?: number;
  /** 小数点后保留位数，默认 0 */
  precision?: number;
  /** 自定义格式化函数（若提供则优先使用） */
  format?: (num: number) => string;
  /** 自定义类名 */
  className?: string;
  /** 是否在数值变化时展示轻微微光脉冲，默认 true */
  glowOnChange?: boolean;
}

/**
 * 具有丝滑缓动滚动效果与等宽字形的数字动画组件
 * 适用于数据大屏、KPI 卡片、时间周期切换统计等场景
 */
export function AnimatedNumber({
  value,
  duration = 420,
  precision = 0,
  format,
  className = '',
  glowOnChange = true,
}: AnimatedNumberProps) {
  const safeTarget = Number.isFinite(value) ? value : 0;
  const [displayValue, setDisplayValue] = useState<number>(safeTarget);
  const [isAnimating, setIsAnimating] = useState(false);

  const startValueRef = useRef(safeTarget);
  const startTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const glowTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 检查是否开启系统减少动画
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion || duration <= 0) {
      setDisplayValue(safeTarget);
      startValueRef.current = safeTarget;
      return;
    }

    const startVal = startValueRef.current;
    const threshold = precision > 0 ? 10 ** -precision : 0.001;

    // 数值无显著变化则直接同步并跳过动画
    if (Math.abs(startVal - safeTarget) < threshold) {
      setDisplayValue(safeTarget);
      return;
    }

    // 触发呼吸光晕
    if (glowOnChange) {
      setIsAnimating(true);
      if (glowTimerRef.current !== null) {
        window.clearTimeout(glowTimerRef.current);
      }
      glowTimerRef.current = window.setTimeout(() => {
        setIsAnimating(false);
      }, duration + 80);
    }

    startTimeRef.current = null;

    const step = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // cubic-bezier(0.16, 1, 0.3, 1) 的近似缓动函数：1 - (1 - t)^4
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const current = startVal + (safeTarget - startVal) * easeProgress;

      setDisplayValue(current);

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(safeTarget);
        startValueRef.current = safeTarget;
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(step);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (glowTimerRef.current !== null) {
        window.clearTimeout(glowTimerRef.current);
      }
    };
  }, [safeTarget, duration, precision, glowOnChange]);

  const formattedText = format
    ? format(displayValue)
    : precision > 0
      ? displayValue.toLocaleString(undefined, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        })
      : Math.round(displayValue).toLocaleString();

  return (
    <span
      className={`animated-counter ${isAnimating ? 'number-pulse-glow' : ''} ${className}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {formattedText}
    </span>
  );
}
