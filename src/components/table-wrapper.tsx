import { useRef, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TableWrapperProps {
  children: ReactNode;
  className?: string;
  stickyFirstColumn?: boolean;
  mobileCompact?: boolean;
}

export function TableWrapper({
  children,
  className,
  stickyFirstColumn = false,
  mobileCompact = true,
}: TableWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkScrollable = () => {
      const hasScroll = container.scrollWidth > container.clientWidth;
      const isScrolledToEnd = 
        container.scrollLeft + container.clientWidth >= container.scrollWidth - 2;
      setIsScrollable(hasScroll && !isScrolledToEnd);
    };

    checkScrollable();
    container.addEventListener("scroll", checkScrollable, { passive: true });
    window.addEventListener("resize", checkScrollable, { passive: true });

    return () => {
      container.removeEventListener("scroll", checkScrollable);
      window.removeEventListener("resize", checkScrollable);
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "table-container",
        isScrollable && "scrollable-right",
        className
      )}
    >
      <div
        className={cn(
          stickyFirstColumn && "table-sticky-first",
          mobileCompact && "table-mobile-compact"
        )}
      >
        {children}
      </div>
    </div>
  );
}
