import { type CSSProperties, type ReactNode, useState } from "react";
import "./Folder.css";

type FolderProps = {
  color?: string;
  size?: number;
  items?: ReactNode[];
  className?: string;
  interactive?: boolean;
  animateOnHover?: boolean;
};

function darkenColor(hex: string, percent: number) {
  let color = hex.startsWith("#") ? hex.slice(1) : hex;
  const isHex = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(color);

  if (!isHex) {
    const primary = Math.max(0, Math.min(100, Math.round((1 - percent) * 100)));
    const shade = Math.max(0, Math.min(100, Math.round(percent * 100)));
    return `color-mix(in srgb, ${hex} ${primary}%, black ${shade}%)`;
  }

  if (color.length === 3) {
    color = color
      .split("")
      .map((value) => value + value)
      .join("");
  }

  const num = Number.parseInt(color, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
  g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
  b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

export default function Folder({
  color = "#5227FF",
  size = 1,
  items = [],
  className = "",
  interactive = true,
  animateOnHover = true
}: FolderProps) {
  const maxItems = 3;
  const papers = items.slice(0, maxItems);

  while (papers.length < maxItems) {
    papers.push(null);
  }

  const [open, setOpen] = useState(false);
  const [paperOffsets, setPaperOffsets] = useState(
    Array.from({ length: maxItems }, () => ({ x: 0, y: 0 }))
  );

  const folderBackColor = darkenColor(color, 0.08);
  const paper1 = darkenColor("#ffffff", 0.1);
  const paper2 = darkenColor("#ffffff", 0.05);
  const paper3 = "#ffffff";

  const handleClick = () => {
    if (!interactive) {
      return;
    }

    setOpen((prev) => !prev);

    if (open) {
      setPaperOffsets(Array.from({ length: maxItems }, () => ({ x: 0, y: 0 })));
    }
  };

  const handlePaperMouseMove = (event: React.MouseEvent<HTMLDivElement>, index: number) => {
    if (!interactive || !open) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = (event.clientX - centerX) * 0.15;
    const offsetY = (event.clientY - centerY) * 0.15;

    setPaperOffsets((prev) => {
      const next = [...prev];
      next[index] = { x: offsetX, y: offsetY };
      return next;
    });
  };

  const handlePaperMouseLeave = (_event: React.MouseEvent<HTMLDivElement>, index: number) => {
    if (!interactive) {
      return;
    }

    setPaperOffsets((prev) => {
      const next = [...prev];
      next[index] = { x: 0, y: 0 };
      return next;
    });
  };

  const folderStyle = {
    "--folder-color": color,
    "--folder-back-color": folderBackColor,
    "--paper-1": paper1,
    "--paper-2": paper2,
    "--paper-3": paper3
  } as CSSProperties;

  const folderClassName = [
    "folder",
    open ? "open" : "",
    interactive ? "" : "folder--static",
    animateOnHover ? "folder--hoverable" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const scaleStyle = { transform: `scale(${size})` };

  return (
    <div style={scaleStyle} className={className} aria-hidden={!interactive}>
      <div
        className={folderClassName}
        style={folderStyle}
        onClick={handleClick}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
      >
        <div className="folder__back">
          {papers.map((item, index) => (
            <div
              key={index}
              className={`paper paper-${index + 1}`}
              onMouseMove={(event) => handlePaperMouseMove(event, index)}
              onMouseLeave={(event) => handlePaperMouseLeave(event, index)}
              style={
                open
                  ? ({
                      "--magnet-x": `${paperOffsets[index]?.x ?? 0}px`,
                      "--magnet-y": `${paperOffsets[index]?.y ?? 0}px`
                    } as CSSProperties)
                  : undefined
              }
            >
              {item}
            </div>
          ))}
          <div className="folder__front"></div>
          <div className="folder__front right"></div>
        </div>
      </div>
    </div>
  );
}
