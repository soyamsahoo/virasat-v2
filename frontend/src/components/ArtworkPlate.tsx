import { useState } from "react";
import { Layers } from "lucide-react";

interface ArtworkPlateProps {
  src?: string | null;
  title?: string;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

/** Artwork plate: renders the archived photograph when available, otherwise
 *  the museum gradient stand-in with the heritage identifier monogram. */
export function ArtworkPlate({
  src,
  title,
  className = "",
  imgClassName = "",
  onClick,
  children,
}: ArtworkPlateProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{
        background:
          "radial-gradient(420px 260px at 30% 20%, rgba(197,160,89,0.28), transparent 60%), linear-gradient(160deg, #1c160e 0%, #2a2013 55%, #17130c 100%)",
      }}
    >
      {showImage ? (
        <img
          src={src!}
          alt={title ?? "Artwork plate"}
          className={`h-full w-full object-cover ${imgClassName}`}
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : (
        <>
          <Layers
            size={84}
            strokeWidth={0.7}
            className="pointer-events-none text-museum-gold/50"
          />
          {title && (
            <span className="pointer-events-none absolute bottom-3 right-4 font-display text-[11px] tracking-widest2 text-museum-gold/90">
              {title}
            </span>
          )}
        </>
      )}
      {children}
    </div>
  );
}
