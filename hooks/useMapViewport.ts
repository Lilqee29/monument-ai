import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// ─── Default region (world view) ─────────────────────────────────────────────

export const DEFAULT_REGION: MapRegion = {
  latitude: 20,
  longitude: 10,
  latitudeDelta: 110,
  longitudeDelta: 110,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseMapViewportOptions {
  debounceMs?: number;
  bufferRatio?: number;
}

export function useMapViewport(options: UseMapViewportOptions = {}) {
  const { debounceMs = 150, bufferRatio = 0.2 } = options;

  const [region, setRegion] = useState<MapRegion>(DEFAULT_REGION);
  const [visibleRegion, setVisibleRegion] = useState<MapRegion>(DEFAULT_REGION);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  /** Check if a coordinate is within the visible bounds + buffer */
  const isWithinViewport = useCallback(
    (coord: Coordinates): boolean => {
      const latBuffer = visibleRegion.latitudeDelta * bufferRatio;
      const lngBuffer = visibleRegion.longitudeDelta * bufferRatio;
      return (
        coord.lat >= visibleRegion.latitude - visibleRegion.latitudeDelta / 2 - latBuffer &&
        coord.lat <= visibleRegion.latitude + visibleRegion.latitudeDelta / 2 + latBuffer &&
        coord.lng >= visibleRegion.longitude - visibleRegion.longitudeDelta / 2 - lngBuffer &&
        coord.lng <= visibleRegion.longitude + visibleRegion.longitudeDelta / 2 + lngBuffer
      );
    },
    [visibleRegion, bufferRatio]
  );

  /** Debounced region change handler — pass to MapView.onRegionChangeComplete */
  const handleRegionChange = useCallback(
    (newRegion: MapRegion): void => {
      setRegion(newRegion);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setVisibleRegion(newRegion);
      }, debounceMs);
    },
    [debounceMs]
  );

  return {
    region,
    setRegion,
    visibleRegion,
    isWithinViewport,
    handleRegionChange,
  };
}
