import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "@mantine/core";

type LabelPathTooltipProps = {
  name: string;
  path: string;
  children: ReactNode;
  opened?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function LabelPathTooltip({
  name,
  path,
  children,
  opened,
  className,
  ariaLabel,
}: LabelPathTooltipProps) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const measureTruncation = useCallback(() => {
    const element = nameRef.current;
    if (!element) return;
    setIsTruncated(element.scrollWidth > element.clientWidth);
  }, []);

  useEffect(() => {
    const element = nameRef.current;
    if (!element) return;

    measureTruncation();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measureTruncation);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measureTruncation, name, path]);

  const hasContext = path !== name;
  const enabled = Boolean(path) && (hasContext || isTruncated);
  const isOpen = (opened || isHovered || isFocused) && enabled;

  return (
    <Tooltip
      label={path}
      multiline
      maw={420}
      withArrow
      withinPortal
      openDelay={250}
      disabled={!enabled}
      opened={isOpen}
    >
      <span
        ref={nameRef}
        className={className}
        aria-label={ariaLabel}
        onMouseEnter={() => {
          measureTruncation();
          setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => {
          measureTruncation();
          setIsFocused(true);
        }}
        onBlurCapture={() => setIsFocused(false)}
      >
        {children}
      </span>
    </Tooltip>
  );
}
