import { useState, useEffect } from 'react';

type Breakpoint = 'mobile' | 'tablet' | 'laptop' | 'desktop';

interface BreakpointResult {
  breakpoint: Breakpoint;
  isMobile: boolean;   // < 640px
  isTablet: boolean;   // 640px - 1023px
  isLaptop: boolean;   // 1024px - 1279px
  isDesktop: boolean;  // >= 1280px
  width: number;
}

export function useBreakpoint(): BreakpointResult {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const breakpoint: Breakpoint =
    width < 640 ? 'mobile' :
    width < 1024 ? 'tablet' :
    width < 1280 ? 'laptop' :
    'desktop';

  return {
    breakpoint,
    isMobile: width < 640,
    isTablet: width >= 640 && width < 1024,
    isLaptop: width >= 1024 && width < 1280,
    isDesktop: width >= 1280,
    width,
  };
}

export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}
