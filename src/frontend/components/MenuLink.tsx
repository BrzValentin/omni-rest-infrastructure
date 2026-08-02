"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { message } from "@/lib/menu-messages";

type MenuLinkProps = Readonly<{
  children: ReactNode;
  className: string;
}>;

export function MenuLink({ children, className }: MenuLinkProps) {
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Link className={className} href="/menu" onClick={() => setLoading(true)}>
        {children}
      </Link>
      {loading ? (
        <span className="visuallyHidden" role="status">
          {message("loading")}
        </span>
      ) : null}
    </>
  );
}
