"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    setActiveSrc(preferredSrc);
  }, [preferredSrc]);

  const usingFallback = activeSrc === FALLBACK_CHART_IMAGE_PATH;

  useEffect(() => {
    const image = imageRef.current;

    if (!image || usingFallback) {
      return;
    }

    if (image.complete && image.naturalWidth === 0) {
      setActiveSrc(FALLBACK_CHART_IMAGE_PATH);
    }
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
      ref={imageRef}
      src={activeSrc}
    />
  );
}
