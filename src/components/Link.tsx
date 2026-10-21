"use client";

import NextLink from "next/link";
import { forwardRef } from "react";
import type { ComponentProps } from "react";

// MUI's `component={Link}` prop, when passed straight through from a Server
// Component, can't cross the RSC boundary as a plain next/link reference
// ("Functions cannot be passed directly to Client Components..."). Wrapping
// it in our own forwardRef'd client component fixes it - use this instead of
// importing next/link directly wherever it's handed to a `component` prop.
const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function Link(props, ref) {
  return <NextLink ref={ref} {...props} />;
});

export default Link;
