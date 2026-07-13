"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";

type ChartArtImageProps = {
  alt?: string;
  className?: string;
  loading?: "eager" | "lazy";
  src?: string | null;
  testId?: string;
};

function normalizeImagePath(src: string | null | undefined) {
  const trimmed = src?.trim();

  return trimmed || FALLBACK_CHART_IMAGE_PATH;
}

export function ChartArtImage({
  alt = "",
  className,
  loading = "lazy",
  src,
  testId = "stage-chart-image",
}: ChartArtImageProps) {
  const preferredSrc = normalizeImagePath(src);
  const [activeSrc, setActiveSrc] = useState(preferredSrc);
  const imageRef = useRef<HTMLImageElement>(null);
  const setImageRef = useCallback(
    (image: HTMLImageElement | null) => {
      imageRef.current = image;

      if (image?.complete && image.naturalWidth === 0 && activeSrc !== FALLBACK_CHART_IMAGE_PATH) {
        setActiveSrc(FALLBACK_CHART_IMAGE_PATH);
      }
    },
    [activeSrc],
  );

  useEffect(() => {
    setActiveSrc(preferredSrc);
  }, [preferredSrc]);

  const usingFallback = activeSrc === FALLBACK_CHART_IMAGE_PATH;

  useEffect(() => {
    const image = imageRef.current;

    if (!image || usingFallback) {
      return undefined;
    }

    let cancelled = false;
    const showFallback = () => {
      if (cancelled) {
        return;
      }

      setActiveSrc((current) => (current === activeSrc ? FALLBACK_CHART_IMAGE_PATH : current));
    };

    image.addEventListener("error", showFallback);

    if (image.complete) {
      if (image.naturalWidth === 0) {
        showFallback();
      }
    } else {
      void image.decode().catch(showFallback);
    }

    return () => {
      cancelled = true;
      image.removeEventListener("error", showFallback);
    };
  }, [activeSrc, usingFallback]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      data-chart-image-active-path={activeSrc}
      data-chart-image-fallback={usingFallback ? "true" : "false"}
      data-testid={testId}
      decoding="async"
      loading={loading}
      onError={() => {
        if (!usingFallback) {
          setActiveSrc(FALLBACK_CHART_IMAGE_PATH);
        }
      }}
      ref={setImageRef}
      src={activeSrc}
    />
  );
}
