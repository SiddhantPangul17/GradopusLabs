import Image from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";

export function BrandLogo() {
  return (
    <Link href="/" className="group inline-flex shrink-0 items-center gap-2 rounded-control">
      {/* Decorative: the visible brand name is the link's accessible name. */}
      <Image
        src={brand.logo.src}
        alt=""
        width={32}
        height={32}
        priority
        className="transition-transform duration-300 ease-out-soft group-hover:-rotate-6 group-hover:scale-105"
      />
      <span className="text-lg font-bold tracking-tight text-foreground">{brand.name}</span>
    </Link>
  );
}
