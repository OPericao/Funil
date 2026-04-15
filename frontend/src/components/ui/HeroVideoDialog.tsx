import { useEffect, useState, type ReactNode } from "react";
import { Play, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Portal } from "./Portal";

type AnimationStyle =
  | "from-bottom"
  | "from-center"
  | "from-top"
  | "from-left"
  | "from-right"
  | "fade"
  | "top-in-bottom-out"
  | "left-in-right-out";

type HeroVideoDialogProps = {
  animationStyle?: AnimationStyle;
  videoSrc: string;
  thumbnailSrc?: string | null;
  thumbnailAlt?: string;
  title?: string;
  className?: string;
  aspectRatio?: "video" | "short";
  triggerContent?: ReactNode;
};

const animationVariants = {
  "from-bottom": {
    initial: { y: "100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
  },
  "from-center": {
    initial: { scale: 0.86, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.86, opacity: 0 },
  },
  "from-top": {
    initial: { y: "-100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "-100%", opacity: 0 },
  },
  "from-left": {
    initial: { x: "-100%", opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: "-100%", opacity: 0 },
  },
  "from-right": {
    initial: { x: "100%", opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: "100%", opacity: 0 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  "top-in-bottom-out": {
    initial: { y: "-100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
  },
  "left-in-right-out": {
    initial: { x: "-100%", opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: "100%", opacity: 0 },
  },
} satisfies Record<AnimationStyle, { initial: object; animate: object; exit: object }>;

export function HeroVideoDialog({
  animationStyle = "from-center",
  videoSrc,
  thumbnailSrc = null,
  thumbnailAlt = "Video thumbnail",
  title = "Video",
  className,
  aspectRatio = "video",
  triggerContent,
}: HeroVideoDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedAnimation = animationVariants[animationStyle];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <div className={className}>
        <button
            type="button"
            aria-label={`Abrir ${title}`}
            className="group relative block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
            onClick={(event) => {
                event.stopPropagation();
                setIsOpen(true);
            }}
        >
        {triggerContent ? (
          triggerContent
        ) : (
          <div className="relative overflow-hidden rounded-control border border-[#F0F0F0] bg-brand-50">
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt={thumbnailAlt}
                className={`w-full object-cover transition duration-200 ease-out group-hover:brightness-90 ${
                  aspectRatio === "short" ? "aspect-[9/16]" : "aspect-video"
                }`}
              />
            ) : (
              <div
                className={`w-full bg-brand-100 ${
                  aspectRatio === "short" ? "aspect-[9/16]" : "aspect-video"
                }`}
              />
            )}

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/35 backdrop-blur-md transition duration-200 group-hover:scale-105">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-md">
                  <Play className="ml-0.5 h-5 w-5 fill-brand-600 text-brand-600" />
                </div>
              </div>
            </div>
          </div>
        )}
      </button>

        <Portal>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
                        onClick={(event) => {
                            event.stopPropagation();
                            setIsOpen(false);
                        }}
                    >
                    <motion.div
                    {...selectedAnimation}
                    transition={{ type: "spring", damping: 28, stiffness: 260 }}
                    className={`relative w-full ${
                        aspectRatio === "short" ? "max-w-[420px]" : "max-w-5xl"
                    }`}
                    onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            aria-label="Cerrar video"
                            className="absolute -top-14 right-0 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md transition hover:bg-black/60"
                            onClick={(event) => {
                                event.stopPropagation();
                                setIsOpen(false);
                            }}
                        >
                            <XIcon className="h-5 w-5" />
                        </button>

                    <div className="overflow-hidden rounded-[20px] border border-white/30 bg-black shadow-2xl">
                        <iframe
                        src={videoSrc}
                        title={title}
                        className={`w-full ${
                            aspectRatio === "short" ? "aspect-[9/16]" : "aspect-video"
                        }`}
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        />
                    </div>
                    </motion.div>
                </motion.div>
                )}
            </AnimatePresence>
        </Portal>
    </div>
  );
}