import Folder from "./Folder";

type StorageTabIconProps = {
  className?: string;
  scale?: number;
  color?: string;
  animated?: boolean;
};

export function StorageTabIcon({
  className,
  scale = 0.24,
  color = "currentColor",
  animated = true
}: StorageTabIconProps) {
  return (
    <div className={`flex items-center justify-center ${className ?? ""}`}>
      <Folder color={color} size={scale} className="origin-center" interactive={false} animateOnHover={animated} />
    </div>
  );
}
