import React, { useCallback, useEffect, useRef, useState } from "react";
import { Popover, UnstyledButton } from "@mantine/core";
import classes from "./collapsed-section-popover.module.css";

/* Gives the pointer time to cross the gap between the icon and the dropdown
   without the list closing under it. */
const CLOSE_DELAY = 150;

interface CollapsedSectionPopoverProps {
  label: string;
  icon: React.ElementType;
  width?: number;
  children: React.ReactNode;
}

/**
 * Renders a sidebar section as a single icon while the sidebar is collapsed.
 * Hovering or clicking the icon opens the section content in a popup to the
 * right; clicking outside, pressing Escape, or moving the pointer away closes
 * it.
 */
export function CollapsedSectionPopover({
  label,
  icon: Icon,
  width = 260,
  children,
}: CollapsedSectionPopoverProps) {
  const [opened, setOpened] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const open = useCallback(() => {
    cancelClose();
    setOpened(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpened(false), CLOSE_DELAY);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="right-start"
      offset={4}
      shadow="md"
      radius="md"
      trapFocus={false}
      /* The sidebar lives inside a fixed AppShell navbar; the absolute strategy
         lags behind on scroll. */
      floatingStrategy="fixed"
      withinPortal
    >
      <Popover.Target>
        <UnstyledButton
          className={classes.iconButton}
          aria-label={label}
          aria-expanded={opened}
          onMouseEnter={open}
          onMouseLeave={scheduleClose}
          onFocus={open}
          onClick={() => (opened ? setOpened(false) : open())}
        >
          <Icon size={18} stroke={2} />
        </UnstyledButton>
      </Popover.Target>

      <Popover.Dropdown
        p={4}
        w={width}
        className={classes.dropdown}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <div className={classes.dropdownHeader}>{label}</div>
        {children}
      </Popover.Dropdown>
    </Popover>
  );
}
