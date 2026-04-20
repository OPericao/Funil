import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import "./AnimatedList.css";

type AnimatedItemProps = {
  children: ReactNode;
  delay?: number;
  index: number;
  onMouseEnter?: () => void;
  onClick?: () => void;
};

type AnimatedListProps<T> = {
  items: T[];
  onItemSelect?: (item: T, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  itemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  getItemLabel?: (item: T, index: number) => string;
};

function AnimatedItem({ children, delay = 0, index, onMouseEnter, onClick }: AnimatedItemProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { amount: 0.35 });

  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
      transition={{ duration: 0.2, delay }}
      className="animated-list-item-shell"
    >
      {children}
    </motion.div>
  );
}

export default function AnimatedList<T>({
  items,
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className = "",
  itemClassName = "",
  displayScrollbar = true,
  initialSelectedIndex = -1,
  renderItem,
  getItemKey,
  getItemLabel
}: AnimatedListProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const handleItemMouseEnter = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleItemClick = useCallback(
    (item: T, index: number) => {
      setSelectedIndex(index);
      onItemSelect?.(item, index);
    },
    [onItemSelect]
  );

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  useEffect(() => {
    if (!enableArrowNavigation) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Enter") {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          event.preventDefault();
          onItemSelect?.(items[selectedIndex], selectedIndex);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableArrowNavigation, items, onItemSelect, selectedIndex]);

  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) {
      return;
    }

    const container = listRef.current;
    const selectedItem = container.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (selectedItem) {
      const extraMargin = 50;
      const containerScrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const itemTop = selectedItem.offsetTop;
      const itemBottom = itemTop + selectedItem.offsetHeight;

      if (itemTop < containerScrollTop + extraMargin) {
        container.scrollTo({ top: itemTop - extraMargin, behavior: "smooth" });
      } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
        container.scrollTo({
          top: itemBottom - containerHeight + extraMargin,
          behavior: "smooth"
        });
      }
    }

    setKeyboardNav(false);
  }, [keyboardNav, selectedIndex]);

  return (
    <div className={`animated-scroll-list-container ${className}`}>
      <div
        ref={listRef}
        className={`animated-scroll-list ${!displayScrollbar ? "no-scrollbar" : ""}`}
        onScroll={handleScroll}
      >
        {items.map((item, index) => {
          const selected = selectedIndex === index;
          const key = getItemKey?.(item, index) ?? index;
          const label = getItemLabel?.(item, index) ?? String(item ?? "");

          return (
            <AnimatedItem
              key={key}
              delay={0.04}
              index={index}
              onMouseEnter={() => handleItemMouseEnter(index)}
              onClick={() => handleItemClick(item, index)}
            >
              {renderItem ? (
                renderItem(item, index, selected)
              ) : (
                <div className={`animated-list-item ${selected ? "selected" : ""} ${itemClassName}`}>
                  <p className="animated-list-item-text">{label}</p>
                </div>
              )}
            </AnimatedItem>
          );
        })}
      </div>

      {showGradients ? (
        <>
          <div className="animated-list-top-gradient" style={{ opacity: topGradientOpacity }} />
          <div className="animated-list-bottom-gradient" style={{ opacity: bottomGradientOpacity }} />
        </>
      ) : null}
    </div>
  );
}
